import { TRPCError } from '@trpc/server';
import { resolveTaskKey, logUsage, OPENROUTER_URL, type WithRLS } from './trpc/routers/ai';
import { getDefaultModelId } from './openrouter';
import type { Db } from './db';

const MODERATION_SYSTEM_PROMPT = `You moderate public blog comments. Reply with exactly one line:
"OK" if the comment is on-topic and not spam, harassment, hate speech, or abuse.
"FLAG: <short reason>" if it looks like spam, harassment, hate speech, or abuse.
Do not reply with anything else.`;

/**
 * Best-effort pre-check run with the commenting user's own BYOK key, if they
 * have one configured. Returns null (no-op) when the user has no AI key at
 * all — there is deliberately no platform-side fallback key for this check,
 * so the cost is only ever incurred by users who opted into configuring AI.
 * A flag is advisory only: the post author always makes the final call.
 */
export async function runCommentModerationCheck(
	withRLS: WithRLS,
	db: Db,
	userId: string,
	content: string
): Promise<{ flagged: boolean; reason: string | null } | null> {
	let apiKey: string;
	let model: string;
	try {
		const resolved = await resolveTaskKey(
			withRLS,
			db,
			userId,
			'moderate',
			undefined,
			await getDefaultModelId('moderate')
		);
		apiKey = resolved.apiKey;
		model = resolved.model;
	} catch (e) {
		if (e instanceof TRPCError && e.code === 'PRECONDITION_FAILED') return null;
		throw e;
	}

	try {
		const res = await fetch(OPENROUTER_URL, {
			method: 'POST',
			headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model,
				max_tokens: 60,
				messages: [
					{ role: 'system', content: MODERATION_SYSTEM_PROMPT },
					{ role: 'user', content }
				]
			})
		});
		if (!res.ok) return null;

		const data = (await res.json()) as {
			choices: { message: { content: string } }[];
			usage?: { prompt_tokens: number; completion_tokens: number };
		};
		const text = data.choices[0]?.message?.content?.trim() ?? '';

		logUsage(withRLS, {
			userId,
			model,
			task: 'moderate',
			inputTokens: data.usage?.prompt_tokens ?? 0,
			outputTokens: data.usage?.completion_tokens ?? 0
		}).catch(() => {});

		const match = /^FLAG:\s*(.*)/i.exec(text);
		if (match) return { flagged: true, reason: match[1].slice(0, 300) || null };
		return { flagged: false, reason: null };
	} catch (e) {
		console.error('[runCommentModerationCheck] provider call failed:', e);
		return null;
	}
}
