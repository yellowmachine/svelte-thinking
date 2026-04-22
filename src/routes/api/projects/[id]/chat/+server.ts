import { error } from '@sveltejs/kit';
import { eq, asc } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db as rawDb } from '$lib/server/db';
import { aiConversation, aiMessage } from '$lib/server/db/schemas/ai.schema';
import { project } from '$lib/server/db/schemas/projects.schema';
import {
  runAgentLoopSSE,
  resolveTaskKey,
  logUsage,
  SYSTEM_PROMPT
} from '$lib/server/trpc/routers/ai';
import type { WithRLS } from '$lib/server/trpc/routers/ai';

const bodySchema = z.object({
  message: z.string().min(1).max(4000),
  conversationId: z.string().optional(),
  modelOverride: z.string().optional()
});

export const POST: RequestHandler = async (event) => {
  if (!event.locals.user) error(401, 'Unauthorized');

  const projectId = event.params.id;
  const user = event.locals.user;
  const withRLS = event.locals.withRLS as WithRLS;

  const parsed = bodySchema.safeParse(await event.request.json().catch(() => null));
  if (!parsed.success) error(400, 'Invalid request body');

  const { message, conversationId: inputConvId, modelOverride } = parsed.data;

  const [proj] = (await withRLS((db) =>
    db
      .select({ id: project.id, agentSystemPrompt: project.agentSystemPrompt })
      .from(project)
      .where(eq(project.id, projectId))
      .limit(1)
  )) as { id: string; agentSystemPrompt: string | null }[];
  if (!proj) error(404, 'Project not found');

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

  const { apiKey, model, resolvedOrgId } = await resolveTaskKey(
    withRLS,
    rawDb,
    user.id,
    'agent',
    projectId
  );
  const effectiveModel = !resolvedOrgId && modelOverride ? modelOverride : model;

  const customPrompt = (proj.agentSystemPrompt ?? '').trim();
  const systemPrompt = customPrompt ? `${customPrompt}\n\n---\n\n${SYSTEM_PROMPT}` : SYSTEM_PROMPT;

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  function send(data: object) {
    writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)).catch(() => {});
  }

  const savedConvId = convId;

  (async () => {
    try {
      const result = await runAgentLoopSSE(
        systemPrompt,
        history,
        message,
        withRLS,
        projectId,
        apiKey,
        effectiveModel,
        send
      );

      const msgId = crypto.randomUUID();
      await withRLS((db) =>
        db.insert(aiMessage).values({
          id: msgId,
          conversationId: savedConvId,
          role: 'assistant',
          content: result.content,
          docsUsed: result.docsUsed.length > 0 ? result.docsUsed : undefined
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
        docsUsed: result.docsUsed,
        pendingActions: result.pendingActions.length > 0 ? result.pendingActions : undefined
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      const isPreCondition = e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'PRECONDITION_FAILED';
      send({ type: 'error', message: isPreCondition ? msg : msg, kind: isPreCondition ? 'system' : 'banner' });
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
