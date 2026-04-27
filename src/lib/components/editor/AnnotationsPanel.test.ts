import { describe, it, expect, vi } from 'vitest';

type Subnote = {
	id: number;
	referenceId: string;
	slug: string;
	notes: string;
	anchorText: string | null;
	createdAt: Date;
	updatedAt: Date;
};

function makeSubnote(overrides: Partial<Subnote> = {}): Subnote {
	return {
		id: 1,
		referenceId: 'ref1',
		slug: 'p1',
		notes: 'Some notes',
		anchorText: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides
	};
}

// handleAssign logic mirrored from AnnotationsPanel
async function handleAssign(
	assignRefId: string,
	onassignreference: ((refId: string) => Promise<void>) | undefined,
	resetFn: () => void
) {
	if (!assignRefId) return;
	await onassignreference?.(assignRefId);
	resetFn();
}

// handleSave logic mirrored from AnnotationsPanel
async function handleSave(
	id: number,
	notes: string,
	onsavesubnote: ((id: number, notes: string) => Promise<void>) | undefined,
	resetFn: () => void
) {
	await onsavesubnote?.(id, notes);
	resetFn();
}

describe('AnnotationsPanel handleAssign', () => {
	it('calls onassignreference with the selected refId', async () => {
		const cb = vi.fn().mockResolvedValue(undefined);
		const reset = vi.fn();
		await handleAssign('ref2', cb, reset);
		expect(cb).toHaveBeenCalledWith('ref2');
		expect(reset).toHaveBeenCalled();
	});

	it('does nothing when assignRefId is empty', async () => {
		const cb = vi.fn();
		const reset = vi.fn();
		await handleAssign('', cb, reset);
		expect(cb).not.toHaveBeenCalled();
		expect(reset).not.toHaveBeenCalled();
	});

	it('resets state even if callback is undefined', async () => {
		const reset = vi.fn();
		await handleAssign('ref1', undefined, reset);
		expect(reset).toHaveBeenCalled();
	});
});

describe('AnnotationsPanel handleSave', () => {
	it('calls onsavesubnote with id and notes', async () => {
		const cb = vi.fn().mockResolvedValue(undefined);
		const reset = vi.fn();
		await handleSave(3, 'updated notes', cb, reset);
		expect(cb).toHaveBeenCalledWith(3, 'updated notes');
		expect(reset).toHaveBeenCalled();
	});

	it('resets editing state even if callback is undefined', async () => {
		const reset = vi.fn();
		await handleSave(1, 'notes', undefined, reset);
		expect(reset).toHaveBeenCalled();
	});
});

describe('AnnotationsPanel subnote display logic', () => {
	it('identifies subnotes with anchor text', () => {
		const s = makeSubnote({ anchorText: 'some selected text' });
		expect(!!s.anchorText).toBe(true);
	});

	it('identifies subnotes without anchor text', () => {
		const s = makeSubnote({ anchorText: null });
		expect(!!s.anchorText).toBe(false);
	});

	it('identifies subnotes with non-empty notes', () => {
		const s = makeSubnote({ notes: 'has content' });
		expect(!!s.notes).toBe(true);
	});

	it('identifies subnotes with empty notes', () => {
		const s = makeSubnote({ notes: '' });
		expect(!!s.notes).toBe(false);
	});
});
