import { z } from 'zod';
import { eq, desc, asc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '$env/dynamic/private';
import { router, protectedProcedure } from '../init';
import { aiConversation, aiMessage } from '$lib/server/db/schemas/ai.schema';
import { document } from '$lib/server/db/schemas/documents.schema';
import { project } from '$lib/server/db/schemas/projects.schema';
import { userAiConfig } from '$lib/server/db/schemas/users.schema';
import { decryptSecret } from '$lib/server/kms';
import type { Db } from '$lib/server/db';

type WithRLS = (fn: (db: Db) => Promise<unknown>) => Promise<unknown>;

// ---------------------------------------------------------------------------
// Builds a plain-text snapshot of the project to use as system prompt context.
// ---------------------------------------------------------------------------
async function buildProjectContext(withRLS: WithRLS, projectId: string): Promise<string> {
	const [proj, docs] = await Promise.all([
		withRLS((db) =>
			db
				.select({ title: project.title, description: project.description })
				.from(project)
				.where(eq(project.id, projectId))
				.limit(1)
		) as Promise<{ title: string; description: string | null }[]>,

		withRLS((db) =>
			db
				.select({ title: document.title, type: document.type, draft: document.draftContent })
				.from(document)
				.where(eq(document.projectId, projectId))
				.orderBy(asc(document.updatedAt))
		) as Promise<{ title: string; type: string; draft: string | null }[]>
	]);

	if (!proj[0]) return '';

	const lines: string[] = [
		`# Proyecto: ${proj[0].title}`,
		proj[0].description ? `Descripción: ${proj[0].description}` : '',
		'',
		'## Documentos del proyecto'
	];

	for (const doc of docs) {
		lines.push(`\n### ${doc.title} (${doc.type})`);
		lines.push(doc.draft?.trim() || '*(sin contenido todavía)*');
	}

	return lines.filter(Boolean).join('\n');
}

const SYSTEM_PROMPT = `Eres un asistente de investigación académica especializado. \
Tienes acceso al contenido completo del proyecto de escritura del usuario. \
Responde siempre en el mismo idioma que el usuario. \
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

			// --- Get or create conversation ---
			let convId = input.conversationId;

			if (!convId) {
				convId = crypto.randomUUID();
				const title = input.message.slice(0, 60) + (input.message.length > 60 ? '…' : '');
				await ctx.withRLS((db) =>
					db.insert(aiConversation).values({
						id: convId!,
						projectId: input.projectId,
						userId,
						title
					})
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

			// --- Save user message ---
			await ctx.withRLS((db) =>
				db.insert(aiMessage).values({
					id: crypto.randomUUID(),
					conversationId: convId!,
					role: 'user',
					content: input.message
				})
			);

			// --- Load full message history for this conversation ---
			const history = (await ctx.withRLS((db) =>
				db
					.select({ role: aiMessage.role, content: aiMessage.content })
					.from(aiMessage)
					.where(eq(aiMessage.conversationId, convId!))
					.orderBy(asc(aiMessage.createdAt))
			)) as { role: 'user' | 'assistant'; content: string }[];

			// --- Get user's OpenRouter key ---
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

			// --- Build project context and call OpenRouter ---
			const context = await buildProjectContext(ctx.withRLS as WithRLS, input.projectId);

			const systemWithContext = context
				? `${SYSTEM_PROMPT}\n\n---\n${context}`
				: SYSTEM_PROMPT;

			const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${userApiKey}`,
					'Content-Type': 'application/json',
					'HTTP-Referer': env.ORIGIN ?? 'http://localhost:5174',
					'X-Title': 'Scholio'
				},
				body: JSON.stringify({
					model: 'anthropic/claude-haiku-4-5',
					max_tokens: 1024,
					messages: [
						{ role: 'system', content: systemWithContext },
						...history.map((m) => ({ role: m.role, content: m.content }))
					]
				})
			});

			if (!openRouterResponse.ok) {
				const err = await openRouterResponse.text();
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: `Error de OpenRouter: ${openRouterResponse.status}. ${err.slice(0, 200)}`
				});
			}

			const openRouterData = (await openRouterResponse.json()) as {
				choices: { message: { content: string } }[];
			};

			const assistantContent = openRouterData.choices[0]?.message?.content ?? '';

			// --- Save assistant message ---
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
	// Inline suggestions: analyzes current draft and returns citation suggestions.
	// Ephemeral — not persisted in DB.
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

			// Load project title for context
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

			const raw =
				response.content[0].type === 'text' ? response.content[0].text.trim() : '[]';

			type RawSuggestion = {
				originalText: string;
				suggestedText: string;
				explanation: string;
			};

			let parsed: RawSuggestion[] = [];
			try {
				parsed = JSON.parse(raw);
				if (!Array.isArray(parsed)) parsed = [];
			} catch {
				parsed = [];
			}

			// Validate and sanitize
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
