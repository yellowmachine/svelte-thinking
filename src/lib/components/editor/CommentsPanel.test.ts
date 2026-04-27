import { describe, it, expect } from 'vitest';

type Reply = { id: string; content: string; authorName: string; createdAt: Date };
type InlineComment = {
	id: string;
	authorId: string;
	authorName: string;
	content: string;
	anchorText: string | null;
	lineStart: number | null;
	characterStart: number | null;
	characterEnd: number | null;
	paragraphNumber: number | null;
	status: 'open' | 'resolved';
	createdAt: Date;
	replies: Reply[];
};

function makeComment(overrides: Partial<InlineComment> = {}): InlineComment {
	return {
		id: 'c1',
		authorId: 'u1',
		authorName: 'Test User',
		content: 'A comment',
		anchorText: null,
		lineStart: null,
		characterStart: null,
		characterEnd: null,
		paragraphNumber: null,
		status: 'open',
		createdAt: new Date(),
		replies: [],
		...overrides
	};
}

// openCount logic mirrored from CommentsPanel
function openCount(comments: InlineComment[]): number {
	return comments.filter((c) => c.status === 'open').length;
}

describe('CommentsPanel openCount logic', () => {
	it('returns 0 for empty list', () => {
		expect(openCount([])).toBe(0);
	});

	it('counts only open comments', () => {
		const comments = [
			makeComment({ id: 'c1', status: 'open' }),
			makeComment({ id: 'c2', status: 'resolved' }),
			makeComment({ id: 'c3', status: 'open' })
		];
		expect(openCount(comments)).toBe(2);
	});

	it('returns 0 when all resolved', () => {
		const comments = [
			makeComment({ id: 'c1', status: 'resolved' }),
			makeComment({ id: 'c2', status: 'resolved' })
		];
		expect(openCount(comments)).toBe(0);
	});

	it('returns all when all open', () => {
		const comments = [makeComment({ id: 'c1' }), makeComment({ id: 'c2' })];
		expect(openCount(comments)).toBe(2);
	});
});

function pluralize(count: number): string {
	return `${count} abierto${count !== 1 ? 's' : ''}`;
}

describe('CommentsPanel pluralization', () => {
	it('singular for 1 open comment', () => {
		expect(pluralize(1)).toBe('1 abierto');
	});

	it('plural for 0 open comments', () => {
		expect(pluralize(0)).toBe('0 abiertos');
	});

	it('plural for 2 open comments', () => {
		expect(pluralize(2)).toBe('2 abiertos');
	});
});
