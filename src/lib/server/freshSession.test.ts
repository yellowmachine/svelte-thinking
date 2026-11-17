import { describe, it, expect } from 'vitest';
import { isSessionFresh, FRESH_SESSION_MAX_AGE_MS } from './freshSession';

const now = new Date('2026-11-17T12:00:00Z');
const ago = (ms: number) => ({ createdAt: new Date(now.getTime() - ms) });

describe('isSessionFresh', () => {
	it('accepts a session started within the window', () => {
		expect(isSessionFresh(ago(0), now)).toBe(true);
		expect(isSessionFresh(ago(FRESH_SESSION_MAX_AGE_MS), now)).toBe(true);
		expect(isSessionFresh({ createdAt: ago(60_000).createdAt.toISOString() }, now)).toBe(true);
	});

	it('rejects an older session, a missing one, or one from the future', () => {
		expect(isSessionFresh(ago(FRESH_SESSION_MAX_AGE_MS + 1), now)).toBe(false);
		expect(isSessionFresh(null, now)).toBe(false);
		expect(isSessionFresh(ago(-60_000), now)).toBe(false);
	});
});
