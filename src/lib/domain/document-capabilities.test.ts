import { describe, it, expect } from 'vitest';
import {
	getSaveDraftCapability,
	canTriggerSave,
	getCommitCapability,
	canTriggerCommit,
	getReclaimWritingCapability,
	getReleaseWriterCapability
} from './document-capabilities';

// ---------------------------------------------------------------------------
// getSaveDraftCapability
// ---------------------------------------------------------------------------

describe('getSaveDraftCapability', () => {
	it('returns ready when online and canWrite', () => {
		expect(getSaveDraftCapability({ canWrite: true, online: true, saving: false })).toEqual({
			kind: 'ready'
		});
	});

	it('returns saving when save is in-flight', () => {
		expect(getSaveDraftCapability({ canWrite: true, online: true, saving: true })).toEqual({
			kind: 'saving'
		});
	});

	it('returns queued when offline but canWrite', () => {
		const cap = getSaveDraftCapability({ canWrite: true, online: false, saving: false });
		expect(cap.kind).toBe('queued');
		expect((cap as { kind: 'queued'; hint: string }).hint).toBeTruthy();
	});

	it('returns blocked when no write permission, even if online', () => {
		const cap = getSaveDraftCapability({ canWrite: false, online: true, saving: false });
		expect(cap.kind).toBe('blocked');
	});

	it('blocked takes priority over offline', () => {
		const cap = getSaveDraftCapability({ canWrite: false, online: false, saving: false });
		expect(cap.kind).toBe('blocked');
	});

	it('blocked takes priority over saving', () => {
		const cap = getSaveDraftCapability({ canWrite: false, online: true, saving: true });
		expect(cap.kind).toBe('blocked');
	});
});

describe('canTriggerSave', () => {
	it('allows ready and queued', () => {
		expect(canTriggerSave({ kind: 'ready' })).toBe(true);
		expect(canTriggerSave({ kind: 'queued', hint: '' })).toBe(true);
	});

	it('blocks saving and blocked', () => {
		expect(canTriggerSave({ kind: 'saving' })).toBe(false);
		expect(canTriggerSave({ kind: 'blocked', reason: '' })).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// getCommitCapability
// ---------------------------------------------------------------------------

describe('getCommitCapability', () => {
	const ready = { canWrite: true, online: true, hasContent: true, committing: false };

	it('returns ready when all conditions met', () => {
		expect(getCommitCapability(ready)).toEqual({ kind: 'ready' });
	});

	it('returns committing when in-flight', () => {
		expect(getCommitCapability({ ...ready, committing: true })).toEqual({ kind: 'committing' });
	});

	it('returns blocked when no write permission', () => {
		const cap = getCommitCapability({ ...ready, canWrite: false });
		expect(cap.kind).toBe('blocked');
	});

	it('returns blocked when offline', () => {
		const cap = getCommitCapability({ ...ready, online: false });
		expect(cap.kind).toBe('blocked');
	});

	it('returns blocked when no content', () => {
		const cap = getCommitCapability({ ...ready, hasContent: false });
		expect(cap.kind).toBe('blocked');
	});

	it('permission blocked takes priority over offline', () => {
		const cap = getCommitCapability({ ...ready, canWrite: false, online: false });
		expect(cap.kind).toBe('blocked');
		expect((cap as { kind: 'blocked'; reason: string }).reason).toMatch(/permission/);
	});

	it('offline blocked takes priority over empty content', () => {
		const cap = getCommitCapability({ ...ready, online: false, hasContent: false });
		expect(cap.kind).toBe('blocked');
		expect((cap as { kind: 'blocked'; reason: string }).reason).toMatch(/connection/);
	});
});

describe('canTriggerCommit', () => {
	it('allows only ready', () => {
		expect(canTriggerCommit({ kind: 'ready' })).toBe(true);
	});

	it('blocks committing and blocked', () => {
		expect(canTriggerCommit({ kind: 'committing' })).toBe(false);
		expect(canTriggerCommit({ kind: 'blocked', reason: '' })).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// getReclaimWritingCapability
// ---------------------------------------------------------------------------

describe('getReclaimWritingCapability', () => {
	it('returns available when owner has delegated to another user', () => {
		expect(getReclaimWritingCapability({ isOwner: true, writerUserId: 'user-2' })).toEqual({
			kind: 'available'
		});
	});

	it('returns hidden when owner has no delegated writer', () => {
		expect(getReclaimWritingCapability({ isOwner: true, writerUserId: null })).toEqual({
			kind: 'hidden'
		});
	});

	it('returns hidden when not owner', () => {
		expect(getReclaimWritingCapability({ isOwner: false, writerUserId: 'user-2' })).toEqual({
			kind: 'hidden'
		});
	});

	it('returns hidden when neither owner nor delegated', () => {
		expect(getReclaimWritingCapability({ isOwner: false, writerUserId: null })).toEqual({
			kind: 'hidden'
		});
	});
});

// ---------------------------------------------------------------------------
// getReleaseWriterCapability
// ---------------------------------------------------------------------------

describe('getReleaseWriterCapability', () => {
	it('returns available when user is writer but role was downgraded (no write access)', () => {
		expect(getReleaseWriterCapability({ isCurrentWriter: true, canWrite: false })).toEqual({
			kind: 'available'
		});
	});

	it('returns hidden when user is writer and still has write access', () => {
		expect(getReleaseWriterCapability({ isCurrentWriter: true, canWrite: true })).toEqual({
			kind: 'hidden'
		});
	});

	it('returns hidden when user is not the writer', () => {
		expect(getReleaseWriterCapability({ isCurrentWriter: false, canWrite: false })).toEqual({
			kind: 'hidden'
		});
	});
});
