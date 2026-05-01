import { error } from '@sveltejs/kit';
import { eq, and, asc } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db as rawDb } from '$lib/server/db';
import { aiConversation, aiMessage } from '$lib/server/db/schemas/ai.schema';
import { document } from '$lib/server/db/schemas/documents.schema';
import { runEditorAgentLoopSSE, resolveTaskKey, logUsage } from '$lib/server/trpc/routers/ai';
import type { WithRLS } from '$lib/server/trpc/routers/ai';

const bodySchema = z.object({
	projectId: z.string(),
	documentTitle: z.string(),
	documentContent: z.string().max(200000),
	spellLanguage: z.string().optional(),
	message: z.string().min(1).max(4000),
	conversationId: z.string().optional(),
	modelOverride: z.string().optional()
});

export const POST: RequestHandler = async (event) => {
	if (!event.locals.user) error(401, 'Unauthorized');

	const documentId = event.params.docId;
	const user = event.locals.user;
	const withRLS = event.locals.withRLS as WithRLS;

	const parsed = bodySchema.safeParse(await event.request.json().catch(() => null));
	if (!parsed.success) error(400, 'Invalid request body');

	const {
		projectId,
		documentTitle,
		documentContent,
		spellLanguage,
		message,
		conversationId: inputConvId,
		modelOverride
	} = parsed.data;

	const [doc] = (await withRLS((db) =>
		db
			.select({ id: document.id })
			.from(document)
			.where(and(eq(document.id, documentId), eq(document.projectId, projectId)))
			.limit(1)
	)) as { id: string }[];
	if (!doc) error(404, 'Document not found');

	let convId = inputConvId;
	if (!convId) {
		convId = crypto.randomUUID();
		const title = message.slice(0, 60) + (message.length > 60 ? '…' : '');
		await withRLS((db) =>
			db.insert(aiConversation).values({ id: convId!, projectId, userId: user.id, title })
		);
	} else {
		const [conv] = (await withRLS((db) =>
			db
				.select({ id: aiConversation.id })
				.from(aiConversation)
				.where(eq(aiConversation.id, convId!))
				.limit(1)
		)) as { id: string }[];
		if (!conv) error(404, 'Conversation not found');
	}

	const history = (await withRLS((db) =>
		db
			.select({ role: aiMessage.role, content: aiMessage.content })
			.from(aiMessage)
			.where(eq(aiMessage.conversationId, convId!))
			.orderBy(asc(aiMessage.createdAt))
	)) as { role: 'user' | 'assistant'; content: string }[];

	await withRLS((db) =>
		db
			.insert(aiMessage)
			.values({ id: crypto.randomUUID(), conversationId: convId!, role: 'user', content: message })
	);

	const [
		{ apiKey: editorApiKey, model: resolvedModel, resolvedOrgId },
		{ apiKey: spellApiKey, model: spellModel },
		{ apiKey: grammarApiKey, model: grammarModel }
	] = await Promise.all([
		resolveTaskKey(withRLS, rawDb, user.id, 'agent', projectId),
		resolveTaskKey(withRLS, rawDb, user.id, 'spell', projectId, 'anthropic/claude-haiku-4-5').catch(
			() => resolveTaskKey(withRLS, rawDb, user.id, 'agent', projectId)
		),
		resolveTaskKey(
			withRLS,
			rawDb,
			user.id,
			'grammar',
			projectId,
			'anthropic/claude-haiku-4-5'
		).catch(() => resolveTaskKey(withRLS, rawDb, user.id, 'agent', projectId))
	]);
	const effectiveModel = !resolvedOrgId && modelOverride ? modelOverride : resolvedModel;

	const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
	const writer = writable.getWriter();
	const encoder = new TextEncoder();

	function send(data: object) {
		writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)).catch(() => {});
	}

	const savedConvId = convId;

	(async () => {
		try {
			const result = await runEditorAgentLoopSSE(
				documentTitle,
				documentContent,
				history,
				message,
				editorApiKey,
				effectiveModel,
				{
					spellApiKey,
					spellModel,
					spellLanguage: spellLanguage ?? 'auto',
					grammarApiKey,
					grammarModel,
					withRLS,
					projectId,
					documentId
				},
				send,
				event.request.signal
			);

			const msgId = crypto.randomUUID();
			await withRLS((db) =>
				db.insert(aiMessage).values({
					id: msgId,
					conversationId: savedConvId,
					role: 'assistant',
					content: result.content
				})
			);
			await withRLS((db) =>
				db
					.update(aiConversation)
					.set({ updatedAt: new Date() })
					.where(eq(aiConversation.id, savedConvId))
			);

			logUsage(withRLS, {
				orgId: resolvedOrgId,
				projectId,
				userId: user.id,
				model: effectiveModel,
				task: 'agent',
				inputTokens: result.inputTokens,
				outputTokens: result.outputTokens
			});

			send({
				type: 'done',
				conversationId: savedConvId,
				messageId: msgId,
				pendingEditorActions:
					result.pendingEditorActions.length > 0 ? result.pendingEditorActions : undefined,
				pendingActions: result.pendingActions.length > 0 ? result.pendingActions : undefined
			});
		} catch (e) {
			if (e instanceof Error && e.name === 'AbortError') return;
			const msg = e instanceof Error ? e.message : 'Unknown error';
			const isPreCondition =
				e &&
				typeof e === 'object' &&
				'code' in e &&
				(e as { code: string }).code === 'PRECONDITION_FAILED';
			send({ type: 'error', message: msg, kind: isPreCondition ? 'system' : 'banner' });
		} finally {
			await writer.close().catch(() => {});
		}
	})();

	return new Response(readable, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
};
