import { describe, it, expect, vi } from 'vitest';

// No Redis in tests: the limiter must fall back to memory.
vi.mock('$lib/server/cache', () => ({ incrementWindow: async () => null }));

const { hitRateLimit } = await import('./rateLimit');

describe('hitRateLimit (memory fallback)', () => {
	const rule = { name: 'test', max: 2, windowSeconds: 60 };

	it('allows up to max hits per window, then blocks', async () => {
		const t = 1_000_000;
		expect((await hitRateLimit(rule, 'ip-1', t)).allowed).toBe(true);
		expect((await hitRateLimit(rule, 'ip-1', t)).allowed).toBe(true);
		expect((await hitRateLimit(rule, 'ip-1', t)).allowed).toBe(false);
		// Another id has its own counter.
		expect((await hitRateLimit(rule, 'ip-2', t)).allowed).toBe(true);
	});

	it('starts over when the window ends', async () => {
		const t = 5_000_000;
		await hitRateLimit(rule, 'ip-3', t);
		await hitRateLimit(rule, 'ip-3', t);
		expect((await hitRateLimit(rule, 'ip-3', t)).allowed).toBe(false);
		expect((await hitRateLimit(rule, 'ip-3', t + 61_000)).allowed).toBe(true);
	});
});
