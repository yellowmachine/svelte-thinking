import { z } from 'zod';
import { eq, desc, asc, inArray, and, ilike, count, sql } from 'drizzle-orm';
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
import { userAiConfig } from '$lib/server/db/schemas/users.schema';
import { decryptSecret } from '$lib/server/kms';
import type { Db } from '$lib/server/db';

type WithRLS = (fn: (db: Db) => Promise<unknown>) => Promise<unknown>;

const DAILY_SUGGESTION_LIMIT = 30;

// ---------------------------------------------------------------------------
// Error helper
// ---------------------------------------------------------------------------

async function throwOpenRouterError(res: Response): Promise<never> {
	let message: string;
	try {
		const body = (await res.json()) as { error?: { message?: string; code?: number } };
		const msg = body?.error?.message ?? '';
		const code = body?.error?.code ?? res.status;
		if (code === 401) message = 'API key de OpenRouter inválida. Revísala en Ajustes → Asistente IA.';
		else if (code === 402) message = 'Has agotado los créditos de OpenRouter. Recarga tu cuenta en openrouter.ai.';
		else if (code === 429) message = 'Límite de peticiones alcanzado en OpenRouter. Espera un momento.';
		else message = msg || `Error de OpenRouter (${res.status}).`;
	} catch {
		message = `Error de OpenRouter (${res.status}).`;
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
			name: 'search_documents',
			description:
				'Busca un término o frase en todos los documentos del proyecto. ' +
				'Devuelve fragmentos con contexto. Útil para localizar menciones de un concepto, autor o cita concreta.',
			parameters: {
				type: 'object',
				properties: {
					query: { type: 'string', description: 'Texto a buscar (sin distinción de mayúsculas)' }
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

		case 'search_documents': {
			const query = ((args.query as string) ?? '').trim();
			if (!query) return 'Error: se requiere el parámetro query.';

			const docs = (await withRLS((db) =>
				db
					.select({ id: document.id, title: document.title, content: document.draftContent })
					.from(document)
					.where(and(eq(document.projectId, projectId), ilike(document.draftContent, `%${query}%`)))
					.limit(5)
			)) as { id: string; title: string; content: string | null }[];

			if (docs.length === 0) return `Sin resultados para "${query}" en ningún documento.`;

			const output: string[] = [];
			for (const doc of docs) {
				const body = doc.content ?? '';
				const lc = body.toLowerCase();
				const ql = query.toLowerCase();
				const snippets: string[] = [];
				let pos = 0;
				while (snippets.length < 3) {
					const idx = lc.indexOf(ql, pos);
					if (idx === -1) break;
					const start = Math.max(0, idx - 120);
					const end = Math.min(body.length, idx + query.length + 120);
					snippets.push(`  …${body.slice(start, end).replace(/\n/g, ' ')}…`);
					pos = idx + query.length;
				}
				output.push(`**${doc.title}** [${doc.id}]`);
				output.push(...snippets);
			}
			return output.join('\n');
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

async function runAgentLoop(
	systemPrompt: string,
	/** Prior turns already persisted in DB (no current user message). */
	history: { role: 'user' | 'assistant'; content: string }[],
	userMessage: string,
	withRLS: WithRLS,
	projectId: string,
	apiKey: string,
	model: string
): Promise<string> {
	const messages: OAMessage[] = [
		...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
		{ role: 'user', content: userMessage }
	];

	for (let i = 0; i < MAX_AGENT_ITERATIONS; i++) {
		const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
				'HTTP-Referer': env.ORIGIN ?? 'http://localhost:5174',
				'X-Title': 'Scholio'
			},
			body: JSON.stringify({
				model,
				max_tokens: 2048,
				messages: [{ role: 'system', content: systemPrompt }, ...messages],
				tools: TOOLS,
				tool_choice: 'auto'
			})
		});

		if (!res.ok) await throwOpenRouterError(res);

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
					const result = await executeTool(tc.function.name, args, withRLS, projectId);
					return { role: 'tool' as const, tool_call_id: tc.id, content: result };
				})
			);
			messages.push(...results);
			continue;
		}

		// ── Final text response ───────────────────────────────────────────────
		return choice.message.content ?? '';
	}

	throw new TRPCError({
		code: 'INTERNAL_SERVER_ERROR',
		message: 'El agente no pudo completar la respuesta en el número máximo de pasos.'
	});
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `Eres un asistente de investigación académica especializado integrado en Scholio.
Tienes acceso al proyecto del usuario a través de las herramientas disponibles.
Antes de responder preguntas sobre el contenido de un documento, usa read_document para leerlo.
Responde siempre en el mismo idioma que el usuario.
Sé preciso, cita fragmentos del texto cuando sea relevante y mantén un tono académico.`;

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

			// ── Get user's API key ────────────────────────────────────────────
			const configRows = (await ctx.withRLS((db) =>
				db
					.select({
						encryptedApiKey: userAiConfig.encryptedApiKey,
						encryptedDataKey: userAiConfig.encryptedDataKey,
						iv: userAiConfig.iv,
						authTag: userAiConfig.authTag,
						enabled: userAiConfig.enabled,
						provider: userAiConfig.provider
					})
					.from(userAiConfig)
					.where(eq(userAiConfig.userId, userId))
					.limit(1)
			)) as {
				encryptedApiKey: string;
				encryptedDataKey: string;
				iv: string;
				authTag: string;
				enabled: boolean;
				provider: string;
			}[];

			if (!configRows[0]) {
				throw new TRPCError({
					code: 'PRECONDITION_FAILED',
					message: 'Configura tu API key de OpenRouter en Ajustes → Asistente IA.'
				});
			}
			if (!configRows[0].enabled) {
				throw new TRPCError({
					code: 'PRECONDITION_FAILED',
					message: 'El asistente IA está deshabilitado. Actívalo en Ajustes → Asistente IA.'
				});
			}

			let userApiKey: string;
			try {
				userApiKey = await decryptSecret(configRows[0]);
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

			const model = configRows[0].provider ?? 'anthropic/claude-haiku-4-5';
			const assistantContent = await runAgentLoop(
				systemWithIndex,
				history,
				input.message,
				ctx.withRLS as WithRLS,
				input.projectId,
				userApiKey,
				model
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
				message: { id: assistantMsgId, role: 'assistant' as const, content: assistantContent }
			};
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
			const configRows = (await ctx.withRLS((db) =>
				db
					.select({
						encryptedApiKey: userAiConfig.encryptedApiKey,
						encryptedDataKey: userAiConfig.encryptedDataKey,
						iv: userAiConfig.iv,
						authTag: userAiConfig.authTag,
						enabled: userAiConfig.enabled,
						provider: userAiConfig.provider
					})
					.from(userAiConfig)
					.where(eq(userAiConfig.userId, ctx.user.id))
					.limit(1)
			)) as {
				encryptedApiKey: string;
				encryptedDataKey: string;
				iv: string;
				authTag: string;
				enabled: boolean;
				provider: string;
			}[];

			if (!configRows[0]) {
				throw new TRPCError({
					code: 'PRECONDITION_FAILED',
					message: 'Configura tu API key de OpenRouter en Ajustes → Asistente IA.'
				});
			}
			if (!configRows[0].enabled) {
				throw new TRPCError({
					code: 'PRECONDITION_FAILED',
					message: 'El asistente IA está deshabilitado. Actívalo en Ajustes → Asistente IA.'
				});
			}

			let userApiKey: string;
			try {
				userApiKey = await decryptSecret(configRows[0]);
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

			const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${userApiKey}`,
					'Content-Type': 'application/json',
					'HTTP-Referer': env.ORIGIN ?? 'http://localhost:5174',
					'X-Title': 'Scholio'
				},
				body: JSON.stringify({
					model: 'anthropic/claude-sonnet-4-5',
					max_tokens: 4096,
					messages: [
						{ role: 'system', content: systemPrompt },
						{ role: 'user', content: userMessage }
					]
				})
			});

			if (!response.ok) await throwOpenRouterError(response);

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
