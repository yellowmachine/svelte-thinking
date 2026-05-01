import { describe, it, expect } from 'vitest';

type Author = { first: string; last: string };

type LibraryRef = {
	id: string;
	citeKey: string;
	type: string;
	title: string;
	authors: Author[];
	year: string | null;
	projectIds: string[];
};

function makeRef(overrides: Partial<LibraryRef> = {}): LibraryRef {
	return {
		id: 'r1',
		citeKey: 'smith2024',
		type: 'article',
		title: 'A Study',
		authors: [{ first: 'John', last: 'Smith' }],
		year: '2024',
		projectIds: [],
		...overrides
	};
}

// llFiltered logic mirrored from LinkLibraryPanel
function filterRefs(refs: LibraryRef[], search: string, filterProjectId: string): LibraryRef[] {
	const q = search.toLowerCase().trim();
	return refs.filter((r) => {
		if (filterProjectId === '__unlinked__' && r.projectIds.length > 0) return false;
		if (
			filterProjectId &&
			filterProjectId !== '__unlinked__' &&
			!r.projectIds.includes(filterProjectId)
		)
			return false;
		if (!q) return true;
		return (
			r.citeKey.toLowerCase().includes(q) ||
			r.title.toLowerCase().includes(q) ||
			r.year?.includes(q) ||
			r.authors.some((a) => a.last.toLowerCase().includes(q) || a.first.toLowerCase().includes(q))
		);
	});
}

describe('LinkLibraryPanel filter logic', () => {
	it('returns all refs when no search or project filter', () => {
		const refs = [makeRef({ id: 'r1' }), makeRef({ id: 'r2' })];
		expect(filterRefs(refs, '', '')).toHaveLength(2);
	});

	it('filters by title (case-insensitive)', () => {
		const refs = [makeRef({ title: 'Machine Learning' }), makeRef({ title: 'Deep History' })];
		expect(filterRefs(refs, 'machine', '')).toHaveLength(1);
		expect(filterRefs(refs, 'MACHINE', '')).toHaveLength(1);
	});

	it('filters by author last name', () => {
		const refs = [
			makeRef({ authors: [{ first: 'John', last: 'Smith' }] }),
			makeRef({ authors: [{ first: 'Ana', last: 'García' }] })
		];
		expect(filterRefs(refs, 'garcía', '')).toHaveLength(1);
	});

	it('filters by citeKey', () => {
		const refs = [makeRef({ citeKey: 'smith2024' }), makeRef({ citeKey: 'jones2020' })];
		expect(filterRefs(refs, 'jones', '')).toHaveLength(1);
	});

	it('filters by year', () => {
		const refs = [
			makeRef({ id: 'r1', citeKey: 'alpha', title: 'Alpha', year: '2024' }),
			makeRef({ id: 'r2', citeKey: 'beta', title: 'Beta', year: '2020' })
		];
		expect(filterRefs(refs, '2024', '')).toHaveLength(1);
	});

	it('shows only unlinked refs when __unlinked__ filter is active', () => {
		const refs = [makeRef({ id: 'r1', projectIds: [] }), makeRef({ id: 'r2', projectIds: ['p1'] })];
		expect(filterRefs(refs, '', '__unlinked__')).toHaveLength(1);
		expect(filterRefs(refs, '', '__unlinked__')[0].id).toBe('r1');
	});

	it('filters by project id', () => {
		const refs = [
			makeRef({ id: 'r1', projectIds: ['p1'] }),
			makeRef({ id: 'r2', projectIds: ['p2'] }),
			makeRef({ id: 'r3', projectIds: [] })
		];
		expect(filterRefs(refs, '', 'p1')).toHaveLength(1);
		expect(filterRefs(refs, '', 'p1')[0].id).toBe('r1');
	});
});

// llToggleAll logic mirrored from LinkLibraryPanel
function toggleAll(filtered: LibraryRef[], selectedIds: Set<string>): Set<string> {
	if (selectedIds.size === filtered.length) {
		return new Set();
	}
	return new Set(filtered.map((r) => r.id));
}

describe('LinkLibraryPanel toggleAll logic', () => {
	it('selects all when none selected', () => {
		const refs = [makeRef({ id: 'r1' }), makeRef({ id: 'r2' })];
		const result = toggleAll(refs, new Set());
		expect(result).toEqual(new Set(['r1', 'r2']));
	});

	it('deselects all when all selected', () => {
		const refs = [makeRef({ id: 'r1' }), makeRef({ id: 'r2' })];
		const result = toggleAll(refs, new Set(['r1', 'r2']));
		expect(result).toEqual(new Set());
	});

	it('selects all when only some selected', () => {
		const refs = [makeRef({ id: 'r1' }), makeRef({ id: 'r2' }), makeRef({ id: 'r3' })];
		const result = toggleAll(refs, new Set(['r1']));
		expect(result).toEqual(new Set(['r1', 'r2', 'r3']));
	});
});
