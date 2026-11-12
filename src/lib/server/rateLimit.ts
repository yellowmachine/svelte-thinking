/**
 * Fixed-window rate limiting for app endpoints (Better Auth limits its own).
 *
 * Counters live in Redis so every app instance shares them. Without Redis it
 * falls back to process memory, which is enough for the single prod instance.
 */
import { incrementWindow } from '$lib/server/cache';

export type RateLimitRule = { name: string; max: number; windowSeconds: number };

export const RATE_LIMITS = {
	waitlist: { name: 'waitlist', max: 5, windowSeconds: 60 * 60 }
} as const satisfies Record<string, RateLimitRule>;

const memory = new Map<string, { count: number; resetAt: number }>();

function incrementInMemory(key: string, windowSeconds: number, now: number): number {
	const entry = memory.get(key);
	if (!entry || entry.resetAt <= now) {
		memory.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
		if (memory.size > 10_000) {
			for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k);
		}
		return 1;
	}
	entry.count += 1;
	return entry.count;
}

/** Counts one hit for `id` (an IP, a user id…) and says whether it is still allowed. */
export async function hitRateLimit(
	rule: RateLimitRule,
	id: string,
	now = Date.now()
): Promise<{ allowed: boolean }> {
	const key = `scholio:ratelimit:${rule.name}:${id}`;
	const count =
		(await incrementWindow(key, rule.windowSeconds)) ??
		incrementInMemory(key, rule.windowSeconds, now);
	return { allowed: count <= rule.max };
}
