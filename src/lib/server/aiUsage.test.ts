import { describe, it, expect, vi, beforeEach } from 'vitest';

const prices: Record<string, { input: number; output: number }> = {};
vi.mock('$lib/server/openrouter', () => ({
	fetchOpenRouterPrices: vi.fn(async () => prices)
}));
vi.mock('$lib/server/db/schemas/ai.schema', () => ({ aiUsageLog: {} }));

const { readUsage, addUsage, storedCost, logUsage, NO_USAGE } = await import('./aiUsage');

beforeEach(() => {
	for (const k of Object.keys(prices)) delete prices[k];
});

describe('readUsage', () => {
	it("takes OpenRouter's charge and tokens", () => {
		expect(readUsage({ prompt_tokens: 10, completion_tokens: 5, cost: 0.0012 })).toEqual({
			inputTokens: 10,
			outputTokens: 5,
			costUsd: 0.0012
		});
	});

	it('leaves the cost unknown when the response had none', () => {
		expect(readUsage({ prompt_tokens: 10, completion_tokens: 5 }).costUsd).toBeNull();
		expect(readUsage(undefined)).toEqual({ inputTokens: 0, outputTokens: 0, costUsd: null });
	});

	it('keeps a zero cost (free models) as known', () => {
		expect(readUsage({ prompt_tokens: 1, completion_tokens: 1, cost: 0 }).costUsd).toBe(0);
	});
});

describe('addUsage', () => {
	it('sums tokens and costs', () => {
		const a = readUsage({ prompt_tokens: 1, completion_tokens: 2, cost: 0.5 });
		const b = readUsage({ prompt_tokens: 3, completion_tokens: 4, cost: 0.25 });
		expect(addUsage(addUsage(NO_USAGE, a), b)).toEqual({
			inputTokens: 4,
			outputTokens: 6,
			costUsd: 0.75
		});
	});

	it('makes the cost unknown if any part was', () => {
		const a = readUsage({ prompt_tokens: 1, completion_tokens: 2, cost: 0.5 });
		const b = readUsage({ prompt_tokens: 3, completion_tokens: 4 });
		expect(addUsage(a, b)).toEqual({ inputTokens: 4, outputTokens: 6, costUsd: null });
	});
});

describe('storedCost', () => {
	it("keeps OpenRouter's charge, ignoring list prices", async () => {
		prices['m'] = { input: 1, output: 1 };
		expect(await storedCost('m', { inputTokens: 100, outputTokens: 100, costUsd: 0.01 })).toEqual({
			costUsd: '0.01000000',
			costIsEstimate: false
		});
	});

	it('estimates from list prices without a charge', async () => {
		prices['m'] = { input: 0.000001, output: 0.000002 };
		expect(await storedCost('m', { inputTokens: 1000, outputTokens: 500, costUsd: null })).toEqual({
			costUsd: '0.00200000',
			costIsEstimate: true
		});
	});

	it('gives no cost for an unknown model without a charge', async () => {
		expect(await storedCost('nope', { inputTokens: 1, outputTokens: 1, costUsd: null })).toEqual({
			costUsd: null,
			costIsEstimate: true
		});
	});
});

describe('logUsage', () => {
	it('stores the exact charge in USD', async () => {
		const values = vi.fn();
		const withRLS = vi.fn(async (fn: (db: never) => Promise<unknown>) =>
			fn({ insert: () => ({ values: async (v: unknown) => values(v) }) } as never)
		);
		await logUsage(withRLS, {
			userId: 'u',
			model: 'm',
			task: 'agent',
			usage: { inputTokens: 3, outputTokens: 4, costUsd: 0.0123 }
		});
		expect(values).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 'u',
				orgId: null,
				projectId: '',
				inputTokens: 3,
				outputTokens: 4,
				costUsd: '0.01230000',
				costIsEstimate: false
			})
		);
	});

	it('never throws', async () => {
		const withRLS = vi.fn(async () => {
			throw new Error('db down');
		});
		const err = vi.spyOn(console, 'error').mockImplementation(() => {});
		await expect(
			logUsage(withRLS, { userId: 'u', model: 'm', task: 'agent', usage: NO_USAGE })
		).resolves.toBeUndefined();
		err.mockRestore();
	});
});
