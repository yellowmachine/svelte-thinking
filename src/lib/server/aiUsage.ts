// What each AI call cost, as OpenRouter charged it.
//
// OpenRouter puts the real charge in every response's `usage.cost` (USD credits, the
// same figure its dashboard shows), streaming included: it comes in the last chunk.
// We keep that as the truth and only fall back to tokens × list price when a response
// came without it.

import { aiUsageLog } from '$lib/server/db/schemas/ai.schema';
import { fetchOpenRouterPrices } from '$lib/server/openrouter';
import type { WithRLS } from '$lib/server/trpc/routers/ai';

/** The `usage` object of an OpenRouter response (or the last chunk of a stream). */
export interface OpenRouterUsage {
	prompt_tokens?: number;
	completion_tokens?: number;
	cost?: number;
}

export interface Usage {
	inputTokens: number;
	outputTokens: number;
	/** What OpenRouter charged, in USD; null when any part of it is unknown. */
	costUsd: number | null;
}

export const NO_USAGE: Usage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };

export function readUsage(usage: OpenRouterUsage | null | undefined): Usage {
	return {
		inputTokens: usage?.prompt_tokens ?? 0,
		outputTokens: usage?.completion_tokens ?? 0,
		costUsd: typeof usage?.cost === 'number' && Number.isFinite(usage.cost) ? usage.cost : null
	};
}

/**
 * Two calls' usage together. A cost stays known only if both were: a partial sum would
 * look exact and be short, while null makes logUsage estimate the whole from tokens.
 */
export function addUsage(a: Usage, b: Usage): Usage {
	return {
		inputTokens: a.inputTokens + b.inputTokens,
		outputTokens: a.outputTokens + b.outputTokens,
		costUsd: a.costUsd === null || b.costUsd === null ? null : a.costUsd + b.costUsd
	};
}

/**
 * The cost to store, in USD: OpenRouter's charge when there is one, else tokens × the
 * model's list price (an estimate), else unknown (a model no longer in the catalog).
 */
export async function storedCost(
	model: string,
	usage: Usage
): Promise<{ costUsd: string | null; costIsEstimate: boolean }> {
	if (usage.costUsd !== null) return { costUsd: usage.costUsd.toFixed(8), costIsEstimate: false };
	const price = (await fetchOpenRouterPrices())[model];
	if (!price) return { costUsd: null, costIsEstimate: true };
	const estimate = usage.inputTokens * price.input + usage.outputTokens * price.output;
	return { costUsd: estimate.toFixed(8), costIsEstimate: true };
}

// Fire-and-forget: inserts a usage record after each AI call. Never throws.
export async function logUsage(
	withRLS: WithRLS,
	{
		orgId,
		projectId,
		userId,
		model,
		task,
		usage
	}: {
		orgId?: string;
		projectId?: string;
		userId: string;
		model: string;
		task: string;
		usage: Usage;
	}
) {
	try {
		const cost = await storedCost(model, usage);
		await withRLS((db) =>
			db.insert(aiUsageLog).values({
				id: crypto.randomUUID(),
				orgId: orgId ?? null,
				projectId: projectId ?? '',
				userId,
				model,
				task,
				inputTokens: usage.inputTokens,
				outputTokens: usage.outputTokens,
				...cost
			})
		);
	} catch (e) {
		console.error('[logUsage] failed:', e);
	}
}
