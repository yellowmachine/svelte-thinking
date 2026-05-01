import { describe, it, expect } from 'vitest';
import { parseBibtexFile } from '$lib/utils/bibtex';

// importPreview logic mirrored from ImportBibPanel
function importPreview(raw: string): number {
	if (!raw.trim()) return 0;
	try {
		return parseBibtexFile(raw).length;
	} catch {
		return 0;
	}
}

describe('ImportBibPanel importPreview logic', () => {
	it('returns 0 for empty input', () => {
		expect(importPreview('')).toBe(0);
		expect(importPreview('   ')).toBe(0);
	});

	it('returns 0 for invalid bibtex', () => {
		expect(importPreview('not bibtex at all')).toBe(0);
	});

	it('counts a single entry', () => {
		const bib = `@article{smith2024,
  title = {A Study},
  author = {Smith, John},
  year = {2024},
  journal = {Nature}
}`;
		expect(importPreview(bib)).toBe(1);
	});

	it('counts multiple entries', () => {
		const bib = `@article{smith2024,
  title = {First},
  author = {Smith, John},
  year = {2024}
}
@book{jones2020,
  title = {Second},
  author = {Jones, Ana},
  year = {2020},
  publisher = {Springer}
}`;
		expect(importPreview(bib)).toBe(2);
	});
});
