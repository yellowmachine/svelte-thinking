import { z } from 'zod';
import { eq, desc, asc, inArray, and, count, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '$env/dynamic/private';
import { router, protectedProcedure } from '../init';
import { aiConversation, aiMessage, userAiUsage } from '$lib/server/db/schemas/ai.schema';
import { document, documentVersion } from '$lib/server/db/schemas/documents.schema';
import { project } from '$lib/server/db/schemas/projects.schema';
import { projectContextLink } from '$lib/server/db/schemas/contextLinks.schema';
import { projectRequirement } from '$lib/server/db/schemas/requirements.schema';
import { projectReference } from '$lib/server/db/schemas/references.schema';
import { userAiConfig, userProfile } from '$lib/server/db/schemas/users.schema';
import { decryptSecret } from '$lib/server/kms';
import { indexDocument, embedQuery } from '$lib/server/embeddings';
import type { Db } from '$lib/server/db';

type WithRLS = (fn: (db: Db) => Promise<unknown>) => Promise<unknown>;

// Pending actions are proposed by the agent and must be confirmed by the user before executing.
export type PendingAction = {
	type: 'create_document';
	title: string;
	docType: 'paper' | 'notes' | 'outline' | 'bibliography' | 'supplementary';
	content: string;
	/** If set, this requirement will be fulfilled with the new document after creation. */
	requirementId?: string;
};

const DAILY_SUGGESTION_LIMIT = 30;

// ---------------------------------------------------------------------------
// Error helper
// ---------------------------------------------------------------------------

async function throwProviderError(res: Response, provider = 'openrouter'): Promise<never> {
	const providerLabel = provider === 'perplexity' ? 'Perplexity' : 'OpenRouter';
	let message: string;
	try {
		const body = (await res.json()) as { error?: { message?: string; code?: number } };
		const msg = body?.error?.message ?? '';
		const code = body?.error?.code ?? res.status;
		if (code === 401) message = `API key de ${providerLabel} inválida. Revísala en Ajustes → Asistente IA.`;
		else if (code === 402) message = `Has agotado los créditos de ${providerLabel}. Recarga tu cuenta.`;
		else if (code === 429) message = `Límite de peticiones alcanzado en ${providerLabel}. Espera un momento.`;
		else message = msg || `Error de ${providerLabel} (${res.status}).`;
	} catch {
		message = `Error de ${providerLabel} (${res.status}).`;
	}
	throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message });
}

// ---------------------------------------------------------------------------
// Project index  (~400 tokens, metadata only — no document content)
// ---------------------------------------------------------------------------

async function buildProjectIndex(withRLS: WithRLS, projectId: string): Promise<string> {
	const [proj, docs, reqs, refCount] = await Promise.all([
		withRLS((db) =>
			db
				.select({
					title: project.title,
					description: project.description,
					requirementsTemplate: project.requirementsTemplate
				})
				.from(project)
				.where(eq(project.id, projectId))
				.limit(1)
		) as Promise<{ title: string; description: string | null; requirementsTemplate: string | null }[]>,

		withRLS((db) =>
			db
				.select({
					id: document.id,
					title: document.title,
					type: document.type,
					wordCount: sql<number>`coalesce(length(${document.draftContent}) / 6, 0)`,
					updatedAt: document.updatedAt
				})
				.from(document)
				.where(eq(document.projectId, projectId))
				.orderBy(desc(document.updatedAt))
		) as Promise<{ id: string; title: string; type: string; wordCount: number; updatedAt: Date }[]>,

		withRLS((db) =>
			db
				.select({
					id: projectRequirement.id,
					name: projectRequirement.name,
					required: projectRequirement.required,
					fulfilledDocumentId: projectRequirement.fulfilledDocumentId,
					order: projectRequirement.order
				})
				.from(projectRequirement)
				.where(eq(projectRequirement.projectId, projectId))
				.orderBy(asc(projectRequirement.order))
		) as Promise<{ id: string; name: string; required: boolean; fulfilledDocumentId: string | null; order: number }[]>,

		withRLS((db) =>
			db
				.select({ total: count() })
				.from(projectReference)
				.where(eq(projectReference.projectId, projectId))
		) as Promise<{ total: number }[]>
	]);

	if (!proj[0]) return '';
	const p = proj[0];
	const lines: string[] = [];

	lines.push(`Proyecto: "${p.title}"`);
	if (p.description) lines.push(`Descripción: ${p.description}`);
	if (p.requirementsTemplate) lines.push(`Tipo de documento: ${p.requirementsTemplate}`);
	lines.push('');

	if (docs.length > 0) {
		lines.push('DOCUMENTOS (usa read_document para leer el contenido de uno):');
		for (const doc of docs) {
			const date = doc.updatedAt.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
			const words = doc.wordCount > 0 ? `~${doc.wordCount.toLocaleString()} palabras` : 'sin contenido';
			lines.push(`  • [${doc.id}] "${doc.title}" (${doc.type}) — ${words} — ${date}`);
		}
	} else {
		lines.push('DOCUMENTOS: ninguno todavía.');
	}
	lines.push('');

	if (reqs.length > 0) {
		const fulfilled = reqs.filter((r) => r.fulfilledDocumentId !== null).length;
		lines.push(`REQUISITOS (${fulfilled}/${reqs.length} completados, usa get_requirement_details para ver descripciones):`);
		for (const req of reqs) {
			const icon = req.fulfilledDocumentId ? '✓' : req.required ? '✗' : '○';
			const docRef = req.fulfilledDocumentId ? ` → [${req.fulfilledDocumentId}]` : '';
			const opt = req.required ? '' : ' (opcional)';
			lines.push(`  ${icon} "${req.name}"${opt}${docRef}`);
		}
		lines.push('');
	}

	const refTotal = refCount[0]?.total ?? 0;
	if (refTotal > 0) {
		lines.push(`REFERENCIAS: ${refTotal} entradas (usa list_references para verlas).`);
	}

	return lines.filter((l) => l !== undefined).join('\n');
}

// ---------------------------------------------------------------------------
// Tool definitions  (OpenAI function-calling format, compatible with OpenRouter)
// ---------------------------------------------------------------------------

const TOOLS = [
	{
		type: 'function' as const,
		function: {
			name: 'read_document',
			description:
				'Lee el contenido completo de un documento del proyecto. ' +
				'Úsala cuando necesites analizar, revisar o citar el contenido de un documento concreto.',
			parameters: {
				type: 'object',
				properties: {
					id: {
						type: 'string',
						description: 'ID del documento (aparece entre corchetes en el índice)'
					}
				},
				required: ['id']
			}
		}
	},
	{
		type: 'function' as const,
		function: {
			name: 'search_documents_semantic',
			description:
				'Busca párrafos relevantes en los documentos del proyecto usando similitud semántica. ' +
				'Devuelve los fragmentos más cercanos al significado de la consulta, aunque no coincidan palabra por palabra. ' +
				'Úsala siempre que necesites encontrar contenido sobre un tema, concepto o idea.',
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description: 'Descripción del contenido que buscas (en lenguaje natural)'
					}
				},
				required: ['query']
			}
		}
	},
	{
		type: 'function' as const,
		function: {
			name: 'list_references',
			description: 'Devuelve la bibliografía completa del proyecto con citekeys.',
			parameters: { type: 'object', properties: {}, required: [] }
		}
	},
	{
		type: 'function' as const,
		function: {
			name: 'get_requirement_details',
			description:
				'Devuelve los requisitos del proyecto con sus descripciones completas y estado actual. ' +
				'Útil para entender qué secciones faltan o qué debe contener cada una.',
			parameters: { type: 'object', properties: {}, required: [] }
		}
	},
	{
		type: 'function' as const,
		function: {
			name: 'create_document',
			description:
				'Propone crear un nuevo documento en el proyecto con contenido generado. ' +
				'El usuario verá una tarjeta de confirmación antes de que el documento se cree. ' +
				'IMPORTANTE: describe siempre en texto lo que vas a proponer ANTES de llamar a esta herramienta. ' +
				'Usa requirementId si hay un requisito pendiente que este documento cumpliría.',
			parameters: {
				type: 'object',
				properties: {
					title: { type: 'string', description: 'Título del documento' },
					type: {
						type: 'string',
						enum: ['paper', 'notes', 'outline', 'bibliography', 'supplementary'],
						description: 'Tipo de documento'
					},
					content: { type: 'string', description: 'Contenido completo en Markdown' },
					requirementId: {
						type: 'string',
						description: 'ID del requisito a vincular al documento tras su creación (opcional)'
					}
				},
				required: ['title', 'type', 'content']
			}
		}
	}
] as const;

// ---------------------------------------------------------------------------
// Tool executor
// ---------------------------------------------------------------------------

async function executeTool(
	name: string,
	args: Record<string, unknown>,
	withRLS: WithRLS,
	projectId: string
): Promise<string> {
	switch (name) {
		case 'read_document': {
			const id = args.id as string;
			if (!id) return 'Error: se requiere el parámetro id.';
			const rows = (await withRLS((db) =>
				db
					.select({
						title: document.title,
						type: document.type,
						content: document.draftContent
					})
					.from(document)
					.where(and(eq(document.id, id), eq(document.projectId, projectId)))
					.limit(1)
			)) as { title: string; type: string; content: string | null }[];

			if (!rows[0]) return `Error: documento "${id}" no encontrado en este proyecto.`;
			const content = rows[0].content?.trim() || '*(sin contenido todavía)*';
			return `# ${rows[0].title} (${rows[0].type})\n\n${content}`;
		}

		case 'search_documents_semantic': {
			const query = ((args.query as string) ?? '').trim();
			if (!query) return 'Error: se requiere el parámetro query.';

			const queryVec = await embedQuery(query);
			const vecLiteral = `[${queryVec.join(',')}]`;

			const result = await withRLS((db) =>
				db.execute(sql`
					SELECT dc.text, dc.document_id, d.title, d.id AS doc_id
					FROM scholio.document_chunk dc
					JOIN scholio.document d ON d.id = dc.document_id
					WHERE dc.project_id = ${projectId}
					ORDER BY dc.embedding <=> ${vecLiteral}::vector
					LIMIT 6
				`)
			);

			const rows = result as unknown as { title: string; doc_id: string; text: string }[];
			if (!rows.length) return `Sin resultados para "${query}". Puede que los documentos aún no estén indexados.`;

			const output: string[] = [];
			for (const row of rows) {
				output.push(`**${row.title}** [${row.doc_id}]\n  ${row.text.replace(/\n/g, ' ')}`);
			}
			return output.join('\n\n');
		}

		case 'list_references': {
			const refs = (await withRLS((db) =>
				db
					.select()
					.from(projectReference)
					.where(eq(projectReference.projectId, projectId))
			)) as (typeof projectReference.$inferSelect)[];

			if (refs.length === 0) return 'Este proyecto no tiene referencias bibliográficas todavía.';

			return refs
				.map((r) => {
					const authors = ((r.authors ?? []) as { first?: string; last?: string }[])
						.map((a) => [a.last, a.first].filter(Boolean).join(', '))
						.join('; ');
					const year = r.year ? ` (${r.year})` : '';
					const doi = r.doi ? ` DOI: ${r.doi}` : '';
					return `[@${r.citeKey}] ${authors}${year}. ${r.title}.${doi}`;
				})
				.join('\n');
		}

		case 'get_requirement_details': {
			const reqs = (await withRLS((db) =>
				db
					.select()
					.from(projectRequirement)
					.where(eq(projectRequirement.projectId, projectId))
					.orderBy(asc(projectRequirement.order))
			)) as (typeof projectRequirement.$inferSelect)[];

			if (reqs.length === 0) return 'Este proyecto no tiene requisitos definidos todavía.';

			return reqs
				.map((r) => {
					const status = r.fulfilledDocumentId
						? `✓ cumplido → [${r.fulfilledDocumentId}]`
						: r.required
							? '✗ pendiente (obligatorio)'
							: '○ pendiente (opcional)';
					const desc = r.description ? `\n    ${r.description}` : '';
					return `• "${r.name}" — ${status}${desc}`;
				})
				.join('\n');
		}

		default:
			return `Herramienta desconocida: "${name}".`;
	}
}

// ---------------------------------------------------------------------------
// Agent loop  — runs up to MAX_ITERATIONS tool-call rounds before returning
// ---------------------------------------------------------------------------

const MAX_AGENT_ITERATIONS = 5;

type OAMessage = {
	role: 'user' | 'assistant' | 'tool';
	content: string | null;
	tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
	tool_call_id?: string;
};

const PROVIDER_URLS: Record<string, string> = {
	openrouter: 'https://openrouter.ai/api/v1/chat/completions',
	perplexity: 'https://api.perplexity.ai/chat/completions'
};

const DEFAULT_MODELS: Record<string, string> = {
	openrouter: 'anthropic/claude-haiku-4-5',
	perplexity: 'sonar'
};

async function runAgentLoop(
	systemPrompt: string,
	/** Prior turns already persisted in DB (no current user message). */
	history: { role: 'user' | 'assistant'; content: string }[],
	userMessage: string,
	withRLS: WithRLS,
	projectId: string,
	apiKey: string,
	provider: string,
	model: string
): Promise<{ content: string; pendingActions: PendingAction[] }> {
	const messages: OAMessage[] = [
		...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
		{ role: 'user', content: userMessage }
	];

	const pendingActions: PendingAction[] = [];
	const baseUrl = PROVIDER_URLS[provider] ?? PROVIDER_URLS.openrouter;
	const extraHeaders: Record<string, string> =
		provider === 'openrouter'
			? { 'HTTP-Referer': env.ORIGIN ?? 'http://localhost:5174', 'X-Title': 'Scholio' }
			: {};

	for (let i = 0; i < MAX_AGENT_ITERATIONS; i++) {
		const res = await fetch(baseUrl, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
				...extraHeaders
			},
			body: JSON.stringify({
				model,
				max_tokens: 2048,
				messages: [{ role: 'system', content: systemPrompt }, ...messages],
				tools: TOOLS,
				tool_choice: 'auto'
			})
		});

		if (!res.ok) await throwProviderError(res, provider);

		const data = (await res.json()) as {
			choices: { message: OAMessage; finish_reason: string }[];
		};
		const choice = data.choices[0];
		if (!choice) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Sin respuesta del modelo.' });

		// ── Tool calls → execute and loop ────────────────────────────────────
		if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls?.length) {
			messages.push(choice.message);

			const results = await Promise.all(
				choice.message.tool_calls.map(async (tc) => {
					let args: Record<string, unknown> = {};
					try { args = JSON.parse(tc.function.arguments); } catch { /* empty args */ }

					// ── Write tools: intercept, queue, don't execute yet ──────
					if (tc.function.name === 'create_document') {
						pendingActions.push({
							type: 'create_document',
							title: (args.title as string) || 'Nuevo documento',
							docType: (args.type as PendingAction['docType']) || 'paper',
							content: (args.content as string) || '',
							requirementId: (args.requirementId as string) || undefined
						});
						return {
							role: 'tool' as const,
							tool_call_id: tc.id,
							content: 'Propuesta registrada. El usuario verá la tarjeta de confirmación.'
						};
					}

					// ── Read tools: execute normally ──────────────────────────
					const result = await executeTool(tc.function.name, args, withRLS, projectId);
					return { role: 'tool' as const, tool_call_id: tc.id, content: result };
				})
			);
			messages.push(...results);
			continue;
		}

		// ── Final text response ───────────────────────────────────────────────
		return { content: choice.message.content ?? '', pendingActions };
	}

	throw new TRPCError({
		code: 'INTERNAL_SERVER_ERROR',
		message: 'El agente no pudo completar la respuesta en el número máximo de pasos.'
	});
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `Eres Scholio, un asistente de escritura académica especializado en filosofía, ciencias sociales y ciencias formales, integrado en una plataforma de investigación.
El usuario trabaja en proyectos académicos (grado, máster, doctorado o investigación) y tu objetivo es ayudarle a estructurar, revisar y desarrollar documentos de alta calidad usando en lo posible los documentos de su proyecto.

## Idioma y estilo

Responde por defecto en el mismo idioma que el mensaje del usuario. Si la pregunta es ambigua respecto al idioma, usa español europeo formal.
Escribe con registro académico: preciso, argumentativo, sin adornos retóricos innecesarios.
Empieza siempre con una respuesta breve y directa (2–3 frases) y luego desarrolla con secciones usando encabezados Markdown cuando la longitud lo justifique.

## Uso de herramientas

**Usa search_documents_semantic** cuando la pregunta requiera información específica del proyecto:
- El usuario pregunta por algo que ya ha escrito (marco teórico, resultados, bibliografía, notas, requisitos, secciones concretas).
- El usuario pide que redactes o generes algo "basándote en mis documentos" o menciona un documento concreto.
- Regla práctica: si la respuesta correcta depende de lo que hay en el proyecto → busca primero.

**No uses search_documents_semantic** para:
- Conocimiento general de escritura académica (qué es un marco teórico, cómo citar en APA, estructura IMRyD, etc.).
- Transformaciones del texto que el usuario ha pegado completo en el mensaje (reescritura, corrección, traducción): trabaja solo con el fragmento recibido.

**Usa create_document** únicamente cuando:
- El usuario pide explícitamente crear un documento nuevo, O
- El usuario acepta explícitamente un borrador que tú has propuesto en la misma conversación.
Nunca llames a create_document sin confirmación previa en la conversación actual.

## Estructura de respuesta para tareas complejas

Para preguntas que involucren contenido del proyecto, organiza tu respuesta con estas secciones cuando aplique:

### Respuesta directa
(2–3 frases que contesten la pregunta)

### Desarrollo
(1–2 párrafos en estilo formal con la respuesta elaborada)

### Referencias al proyecto
(Qué documentos o fragmentos has usado: "He utilizado 'Marco teórico', sección sobre epistemología, y 'Notas sobre Popper'")

### Sugerencias
(Bullets concretos: frases modelo, cambios de orden, conexiones entre secciones, términos técnicos a reforzar)

### Próximos pasos
(2–4 bullets accionables)

Para generación de texto (borradores, introducciones, estado del arte): produce el borrador en Markdown académico con ## para secciones. Marca las citas bibliográficas sin referencia como placeholders: [Autor, año].

## Rigor sobre el contenido del proyecto

Cuando hables de lo que el usuario ya ha escrito, limita tus afirmaciones estrictamente a lo que aparezca en los fragmentos devueltos por search_documents_semantic y en el mensaje del usuario.
Si una información no está en esos fragmentos, dilo explícitamente: "Esa información no consta en los documentos recuperados" y sugiere al usuario cómo podría redactarla o qué tipo de fuente debería consultar.
Prefiere reconocer incertidumbre antes que inventar contenido, secciones, resultados o citas.
Cuando sea posible, indica qué documento o fragmento fundamenta cada afirmación importante sobre el proyecto.`;

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const aiRouter = router({
	listConversations: protectedProcedure
		.input(z.string())
		.query(async ({ ctx, input: projectId }) => {
			return ctx.withRLS((db) =>
				db
					.select()
					.from(aiConversation)
					.where(eq(aiConversation.projectId, projectId))
					.orderBy(desc(aiConversation.updatedAt))
			);
		}),

	getConversation: protectedProcedure
		.input(z.string())
		.query(async ({ ctx, input: conversationId }) => {
			const [conv, messages] = await Promise.all([
				ctx.withRLS((db) =>
					db
						.select()
						.from(aiConversation)
						.where(eq(aiConversation.id, conversationId))
						.limit(1)
				) as Promise<(typeof aiConversation.$inferSelect)[]>,

				ctx.withRLS((db) =>
					db
						.select()
						.from(aiMessage)
						.where(eq(aiMessage.conversationId, conversationId))
						.orderBy(asc(aiMessage.createdAt))
				) as Promise<(typeof aiMessage.$inferSelect)[]>
			]);

			if (!conv[0]) throw new TRPCError({ code: 'NOT_FOUND' });
			return { conversation: conv[0], messages };
		}),

	sendMessage: protectedProcedure
		.input(
			z.object({
				projectId: z.string(),
				conversationId: z.string().optional(),
				message: z.string().min(1).max(4000)
			})
		)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.user.id;

			// ── Get or create conversation ────────────────────────────────────
			let convId = input.conversationId;
			if (!convId) {
				convId = crypto.randomUUID();
				const title = input.message.slice(0, 60) + (input.message.length > 60 ? '…' : '');
				await ctx.withRLS((db) =>
					db.insert(aiConversation).values({ id: convId!, projectId: input.projectId, userId, title })
				);
			} else {
				const rows = (await ctx.withRLS((db) =>
					db
						.select({ id: aiConversation.id })
						.from(aiConversation)
						.where(eq(aiConversation.id, convId!))
						.limit(1)
				)) as { id: string }[];
				if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
			}

			// ── Load prior history (before saving current message) ────────────
			const history = (await ctx.withRLS((db) =>
				db
					.select({ role: aiMessage.role, content: aiMessage.content })
					.from(aiMessage)
					.where(eq(aiMessage.conversationId, convId!))
					.orderBy(asc(aiMessage.createdAt))
			)) as { role: 'user' | 'assistant'; content: string }[];

			// ── Persist user message ──────────────────────────────────────────
			await ctx.withRLS((db) =>
				db.insert(aiMessage).values({
					id: crypto.randomUUID(),
					conversationId: convId!,
					role: 'user',
					content: input.message
				})
			);

			// ── Get user's default provider + API config ─────────────────────
			const [profileRows, allConfigs] = await Promise.all([
				ctx.withRLS((db) =>
					db
						.select({
							defaultAiProvider: userProfile.defaultAiProvider,
							defaultAiModel: userProfile.defaultAiModel
						})
						.from(userProfile)
						.where(eq(userProfile.userId, userId))
						.limit(1)
				) as Promise<{ defaultAiProvider: string | null; defaultAiModel: string | null }[]>,

				ctx.withRLS((db) =>
					db
						.select({
							encryptedApiKey: userAiConfig.encryptedApiKey,
							encryptedDataKey: userAiConfig.encryptedDataKey,
							iv: userAiConfig.iv,
							authTag: userAiConfig.authTag,
							enabled: userAiConfig.enabled,
							provider: userAiConfig.provider,
							model: userAiConfig.model
						})
						.from(userAiConfig)
						.where(eq(userAiConfig.userId, userId))
				) as Promise<{
					encryptedApiKey: string;
					encryptedDataKey: string;
					iv: string;
					authTag: string;
					enabled: boolean;
					provider: string;
					model: string | null;
				}[]>
			]);

			const activeProvider = profileRows[0]?.defaultAiProvider ?? 'openrouter';
			const configRow = allConfigs.find((c) => c.provider === activeProvider && c.enabled);

			if (!configRow) {
				const label = activeProvider === 'perplexity' ? 'Perplexity' : 'OpenRouter';
				throw new TRPCError({
					code: 'PRECONDITION_FAILED',
					message: `Configura tu API key de ${label} en Ajustes → Asistente IA.`
				});
			}

			let userApiKey: string;
			try {
				userApiKey = await decryptSecret(configRow);
			} catch {
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'Error al descifrar la API key. Vuelve a guardarla en Ajustes.'
				});
			}

			// ── Build project index and run agent loop ────────────────────────
			const projectIndex = await buildProjectIndex(ctx.withRLS as WithRLS, input.projectId);
			const systemWithIndex = projectIndex
				? `${SYSTEM_PROMPT}\n\n---\n\n${projectIndex}`
				: SYSTEM_PROMPT;

			const resolvedModel =
				profileRows[0]?.defaultAiModel ??
				configRow.model ??
				DEFAULT_MODELS[activeProvider] ??
				DEFAULT_MODELS.openrouter;

			const { content: assistantContent, pendingActions } = await runAgentLoop(
				systemWithIndex,
				history,
				input.message,
				ctx.withRLS as WithRLS,
				input.projectId,
				userApiKey,
				activeProvider,
				resolvedModel
			);

			// ── Persist assistant response ────────────────────────────────────
			const assistantMsgId = crypto.randomUUID();
			await ctx.withRLS((db) =>
				db.insert(aiMessage).values({
					id: assistantMsgId,
					conversationId: convId!,
					role: 'assistant',
					content: assistantContent
				})
			);
			await ctx.withRLS((db) =>
				db
					.update(aiConversation)
					.set({ updatedAt: new Date() })
					.where(eq(aiConversation.id, convId!))
			);

			return {
				conversationId: convId,
				message: { id: assistantMsgId, role: 'assistant' as const, content: assistantContent },
				pendingActions: pendingActions.length > 0 ? pendingActions : undefined
			};
		}),

	// ---------------------------------------------------------------------------
	// Apply a pending action confirmed by the user
	// ---------------------------------------------------------------------------
	applyAction: protectedProcedure
		.input(
			z.object({
				projectId: z.string(),
				action: z.object({
					type: z.literal('create_document'),
					title: z.string().min(1).max(255),
					docType: z.enum(['paper', 'notes', 'outline', 'bibliography', 'supplementary']),
					content: z.string(),
					requirementId: z.string().optional()
				})
			})
		)
		.mutation(async ({ ctx, input }) => {
			const docId = crypto.randomUUID();
			const versionId = crypto.randomUUID();

			await ctx.withRLS(async (db) => {
				await db.insert(document).values({
					id: docId,
					projectId: input.projectId,
					title: input.action.title,
					type: input.action.docType,
					draftContent: input.action.content
				});
				await db.insert(documentVersion).values({
					id: versionId,
					documentId: docId,
					content: '',
					versionNumber: 1,
					changeDescription: 'Creado por el agente',
					createdBy: ctx.user.id
				});
				await db
					.update(document)
					.set({ currentVersionId: versionId })
					.where(eq(document.id, docId));

				if (input.action.requirementId) {
					await db
						.update(projectRequirement)
						.set({ fulfilledDocumentId: docId })
						.where(
							and(
								eq(projectRequirement.id, input.action.requirementId),
								eq(projectRequirement.projectId, input.projectId)
							)
						);
				}
			});

			// Fire-and-forget indexing after transaction commits
			ctx.withRLS((db) =>
				indexDocument(db, docId, input.projectId, input.action.content)
			).catch((err) => console.error('[embeddings] indexDocument failed:', err));

			return { documentId: docId, title: input.action.title };
		}),

	deleteConversation: protectedProcedure
		.input(z.string())
		.mutation(async ({ ctx, input: conversationId }) => {
			const rows = (await ctx.withRLS((db) =>
				db
					.delete(aiConversation)
					.where(eq(aiConversation.id, conversationId))
					.returning({ id: aiConversation.id })
			)) as { id: string }[];
			if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
			return { id: conversationId };
		}),

	// ---------------------------------------------------------------------------
	// Draft generation  (unchanged — one-shot, not agentic)
	// ---------------------------------------------------------------------------
	generateDraft: protectedProcedure
		.input(
			z.object({
				projectId: z.string(),
				documentIds: z.array(z.string()),
				outputType: z.enum([
					'full_paper',
					'introduction',
					'abstract',
					'discussion',
					'conclusion',
					'methodology',
					'literature_review'
				]),
				style: z.enum(['formal', 'technical', 'review']).default('formal'),
				audience: z.enum(['experts', 'general', 'students']).default('experts'),
				extraInstructions: z.string().max(1000).optional()
			})
		)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.user.id;

			const [profileRows, allConfigs] = await Promise.all([
				ctx.withRLS((db) =>
					db
						.select({ defaultAiProvider: userProfile.defaultAiProvider, defaultAiModel: userProfile.defaultAiModel })
						.from(userProfile)
						.where(eq(userProfile.userId, userId))
						.limit(1)
				) as Promise<{ defaultAiProvider: string | null; defaultAiModel: string | null }[]>,

				ctx.withRLS((db) =>
					db
						.select({
							encryptedApiKey: userAiConfig.encryptedApiKey,
							encryptedDataKey: userAiConfig.encryptedDataKey,
							iv: userAiConfig.iv,
							authTag: userAiConfig.authTag,
							enabled: userAiConfig.enabled,
							provider: userAiConfig.provider,
							model: userAiConfig.model
						})
						.from(userAiConfig)
						.where(eq(userAiConfig.userId, userId))
				) as Promise<{ encryptedApiKey: string; encryptedDataKey: string; iv: string; authTag: string; enabled: boolean; provider: string; model: string | null }[]>
			]);

			const activeProvider = profileRows[0]?.defaultAiProvider ?? 'openrouter';
			const configRow = allConfigs.find((c) => c.provider === activeProvider && c.enabled);

			if (!configRow) {
				const label = activeProvider === 'perplexity' ? 'Perplexity' : 'OpenRouter';
				throw new TRPCError({
					code: 'PRECONDITION_FAILED',
					message: `Configura tu API key de ${label} en Ajustes → Asistente IA.`
				});
			}

			const resolvedModel =
				profileRows[0]?.defaultAiModel ??
				configRow.model ??
				(activeProvider === 'perplexity' ? 'sonar-pro' : 'anthropic/claude-sonnet-4-5');

			let userApiKey: string;
			try {
				userApiKey = await decryptSecret(configRow);
			} catch {
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'Error al descifrar la API key. Vuelve a guardarla en Ajustes.'
				});
			}

			const [proj, selectedDocs, ctxLinks] = await Promise.all([
				ctx.withRLS((db) =>
					db
						.select({ title: project.title, description: project.description })
						.from(project)
						.where(eq(project.id, input.projectId))
						.limit(1)
				) as Promise<{ title: string; description: string | null }[]>,

				input.documentIds.length > 0
					? (ctx.withRLS((db) =>
							db
								.select({ title: document.title, type: document.type, draft: document.draftContent })
								.from(document)
								.where(inArray(document.id, input.documentIds))
								.orderBy(asc(document.updatedAt))
						) as Promise<{ title: string; type: string; draft: string | null }[]>)
					: Promise.resolve([]),

				ctx.withRLS((db) =>
					db
						.select({
							docTitle: document.title,
							docType: document.type,
							draft: document.draftContent,
							sourceProject: project.title
						})
						.from(projectContextLink)
						.innerJoin(document, eq(document.id, projectContextLink.linkedDocumentId))
						.leftJoin(project, eq(project.id, document.projectId))
						.where(eq(projectContextLink.projectId, input.projectId))
				) as Promise<{ docTitle: string; docType: string; draft: string | null; sourceProject: string | null }[]>
			]);

			if (!proj[0]) throw new TRPCError({ code: 'NOT_FOUND' });

			const outputTypeLabels: Record<string, string> = {
				full_paper: 'artículo académico completo',
				introduction: 'sección de Introducción',
				abstract: 'Resumen (Abstract)',
				discussion: 'sección de Discusión',
				conclusion: 'sección de Conclusión',
				methodology: 'sección de Metodología',
				literature_review: 'Revisión de Literatura'
			};
			const styleLabels: Record<string, string> = {
				formal: 'formal y riguroso',
				technical: 'técnico y detallado',
				review: 'de revisión crítica'
			};
			const audienceLabels: Record<string, string> = {
				experts: 'expertos en el área',
				general: 'público general con interés en el tema',
				students: 'estudiantes universitarios'
			};

			const contextBlock =
				selectedDocs.length > 0
					? selectedDocs
							.map((d) => `### ${d.title} (${d.type})\n${d.draft?.trim() || '*(sin contenido)*'}`)
							.join('\n\n')
					: '*(No se seleccionaron documentos de contexto)*';

			const externalBlock =
				ctxLinks.length > 0
					? '\n\n## Contexto externo (otros proyectos)\n' +
						ctxLinks
							.map(
								(l) =>
									`### ${l.docTitle} (${l.docType}) — de "${l.sourceProject ?? 'proyecto externo'}"\n${l.draft?.trim() || '*(sin contenido)*'}`
							)
							.join('\n\n')
					: '';

			const systemPrompt = `Eres un asistente de escritura académica de alto nivel. \
Tu tarea es generar un borrador de ${outputTypeLabels[input.outputType]} \
con un estilo ${styleLabels[input.style]}, dirigido a ${audienceLabels[input.audience]}. \
Responde siempre en el mismo idioma que los documentos de contexto. \
Usa formato Markdown: encabezados, listas, párrafos bien estructurados. \
Genera solo el contenido del borrador, sin explicaciones adicionales ni meta-comentarios.`;

			const userMessage = [
				`Proyecto: **${proj[0].title}**`,
				proj[0].description ? `Descripción: ${proj[0].description}` : '',
				'',
				'## Documentos de contexto',
				contextBlock + externalBlock,
				input.extraInstructions ? `\n## Instrucciones adicionales\n${input.extraInstructions}` : ''
			]
				.filter(Boolean)
				.join('\n');

			const draftBaseUrl = PROVIDER_URLS[activeProvider] ?? PROVIDER_URLS.openrouter;
			const draftExtraHeaders: Record<string, string> =
				activeProvider === 'openrouter'
					? { 'HTTP-Referer': env.ORIGIN ?? 'http://localhost:5174', 'X-Title': 'Scholio' }
					: {};

			const response = await fetch(draftBaseUrl, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${userApiKey}`,
					'Content-Type': 'application/json',
					...draftExtraHeaders
				},
				body: JSON.stringify({
					model: resolvedModel,
					max_tokens: 4096,
					messages: [
						{ role: 'system', content: systemPrompt },
						{ role: 'user', content: userMessage }
					]
				})
			});

			if (!response.ok) await throwProviderError(response, activeProvider);

			const data = (await response.json()) as {
				choices: { message: { content: string } }[];
			};
			const generatedContent = data.choices[0]?.message?.content ?? '';

			const docId = crypto.randomUUID();
			const versionId = crypto.randomUUID();
			const typeLabel = outputTypeLabels[input.outputType] ?? input.outputType;
			const docTitle = `Borrador: ${typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)}`;

			await ctx.withRLS(async (db) => {
				await db.insert(document).values({
					id: docId,
					projectId: input.projectId,
					title: docTitle,
					type: 'paper',
					draftContent: generatedContent
				});
				await db.insert(documentVersion).values({
					id: versionId,
					documentId: docId,
					content: '',
					versionNumber: 1,
					changeDescription: 'Versión inicial',
					createdBy: ctx.user.id
				});
				await db.update(document).set({ currentVersionId: versionId }).where(eq(document.id, docId));
			});

			return { documentId: docId, title: docTitle };
		}),

	// ---------------------------------------------------------------------------
	// Inline suggestions  (unchanged — ephemeral, server-key only)
	// ---------------------------------------------------------------------------
	suggest: protectedProcedure
		.input(
			z.object({
				projectId: z.string(),
				content: z.string().min(1).max(50_000)
			})
		)
		.mutation(async ({ ctx, input }) => {
			if (!env.ANTHROPIC_API_KEY) {
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'ANTHROPIC_API_KEY no configurada.'
				});
			}

			const userId = ctx.user.id;
			const today = new Date().toISOString().slice(0, 10);

			const usageRows = (await ctx.withRLS((db) =>
				db
					.select({ suggestionCount: userAiUsage.suggestionCount })
					.from(userAiUsage)
					.where(and(eq(userAiUsage.userId, userId), eq(userAiUsage.date, today)))
					.limit(1)
			)) as { suggestionCount: number }[];

			const currentCount = usageRows[0]?.suggestionCount ?? 0;
			if (currentCount >= DAILY_SUGGESTION_LIMIT) {
				throw new TRPCError({
					code: 'TOO_MANY_REQUESTS',
					message: `Has alcanzado el límite de ${DAILY_SUGGESTION_LIMIT} sugerencias IA por día. Se restablece a medianoche.`
				});
			}

			const proj = (await ctx.withRLS((db) =>
				db
					.select({ title: project.title })
					.from(project)
					.where(eq(project.id, input.projectId))
					.limit(1)
			)) as { title: string }[];

			const projectTitle = proj[0]?.title ?? 'Proyecto académico';
			const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

			const response = await anthropic.messages.create({
				model: 'claude-haiku-4-5-20251001',
				max_tokens: 1024,
				system: `Eres un asistente de escritura académica. Analiza el borrador del usuario y devuelve sugerencias de citas y referencias.

Responde ÚNICAMENTE con un array JSON válido (sin markdown, sin explicaciones fuera del JSON) con el siguiente formato:
[
  {
    "originalText": "fragmento exacto del texto donde insertar la referencia",
    "suggestedText": "el mismo fragmento con la referencia añadida",
    "explanation": "breve explicación de por qué esta cita es relevante"
  }
]

Reglas:
- Máximo 3 sugerencias por respuesta.
- Solo sugerencias de alta relevancia. Si no hay sugerencias claras, devuelve [].
- originalText debe ser un fragmento literal que aparezca en el draft.
- suggestedText debe ser mínimamente invasivo: añade la cita entre paréntesis o como nota al pie.
- Usa el idioma del documento.
- Proyecto: "${projectTitle}"`,
				messages: [{ role: 'user', content: input.content }]
			});

			const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : '[]';

			type RawSuggestion = { originalText: string; suggestedText: string; explanation: string };
			let parsed: RawSuggestion[] = [];
			try {
				parsed = JSON.parse(raw);
				if (!Array.isArray(parsed)) parsed = [];
			} catch {
				parsed = [];
			}

			await ctx.withRLS((db) =>
				db
					.insert(userAiUsage)
					.values({ id: crypto.randomUUID(), userId, date: today, suggestionCount: 1 })
					.onConflictDoUpdate({
						target: [userAiUsage.userId, userAiUsage.date],
						set: { suggestionCount: sql`${userAiUsage.suggestionCount} + 1` }
					})
			);

			return parsed
				.filter(
					(s) =>
						typeof s.originalText === 'string' &&
						typeof s.suggestedText === 'string' &&
						typeof s.explanation === 'string' &&
						s.originalText.length > 0 &&
						input.content.includes(s.originalText)
				)
				.slice(0, 3)
				.map((s, i) => ({ id: `s-${i}`, ...s }));
		})
});
