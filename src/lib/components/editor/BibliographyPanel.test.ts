import { describe, it, expect } from 'vitest';
import type { CiteRef } from '$lib/utils/citations';

// Filter logic mirrored from BibliographyPanel — tests the pure business logic.
function filterRefs(refs: CiteRef[], query: string): CiteRef[] {
	const q = query.toLowerCase();
	if (!q) return refs;
	return refs.filter(
		(r) =>
			r.citeKey.toLowerCase().includes(q) ||
			r.title.toLowerCase().includes(q) ||
			r.authors.some((a) => a.last.toLowerCase().includes(q))
	);
}

const refs: CiteRef[] = [
	{
		id: '1',
		citeKey: 'dennett1991',
		type: 'book',
		title: 'Consciousness Explained',
		authors: [{ first: 'Daniel', last: 'Dennett' }],
		year: '1991'
	},
	{
		id: '2',
		citeKey: 'chalmers1996',
		type: 'book',
		title: 'The Conscious Mind',
		authors: [{ first: 'David', last: 'Chalmers' }],
		year: '1996'
	},
	{
		id: '3',
		citeKey: 'nagel1974',
		type: 'article',
		title: 'What Is It Like to Be a Bat?',
		authors: [{ first: 'Thomas', last: 'Nagel' }],
		year: '1974'
	}
];

describe('BibliographyPanel filter logic', () => {
	it('returns all refs when query is empty', () => {
		expect(filterRefs(refs, '')).toHaveLength(3);
	});

	it('matches by citeKey', () => {
		const result = filterRefs(refs, 'dennett1991');
		expect(result).toHaveLength(1);
		expect(result[0].citeKey).toBe('dennett1991');
	});

	it('matches by author last name (case-insensitive)', () => {
		const result = filterRefs(refs, 'Chalmers');
		expect(result).toHaveLength(1);
		expect(result[0].citeKey).toBe('chalmers1996');
	});

	it('matches by title substring', () => {
		const result = filterRefs(refs, 'bat');
		expect(result).toHaveLength(1);
		expect(result[0].citeKey).toBe('nagel1974');
	});

	it('matches partial citeKey', () => {
		const result = filterRefs(refs, '1996');
		expect(result).toHaveLength(1);
		expect(result[0].citeKey).toBe('chalmers1996');
	});

	it('returns empty array when no match', () => {
		expect(filterRefs(refs, 'xyz_not_found')).toHaveLength(0);
	});

	it('handles empty refs list', () => {
		expect(filterRefs([], 'dennett')).toHaveLength(0);
	});

	it('is case-insensitive for title match', () => {
		const result = filterRefs(refs, 'CONSCIOUS');
		expect(result.map((r) => r.citeKey)).toEqual(
			expect.arrayContaining(['dennett1991', 'chalmers1996'])
		);
	});
});
