// ────────────────────────────────────────────────────────────────────────────
// Citation formatting utilities — APA 7, IEEE, Vancouver
// Pure functions, no server imports, safe for client and server.
// ────────────────────────────────────────────────────────────────────────────

import type { Author } from './bibtex';

export type CitationStyle = 'apa' | 'ieee' | 'vancouver';

export interface CiteRef {
	citeKey: string;
	type: string;
	title: string;
	authors: Author[];
	editors?: Author[];
	year?: string | null;
	journal?: string | null;
	volume?: string | null;
	issue?: string | null;
	pages?: string | null;
	publisher?: string | null;
	school?: string | null;
	institution?: string | null;
	booktitle?: string | null;
	organization?: string | null;
	edition?: string | null;
	address?: string | null;
	isbn?: string | null;
	doi?: string | null;
	url?: string | null;
	note?: string | null;
	reportNumber?: string | null;
}

// ── Name helpers ──────────────────────────────────────────────────────────

function initials(first: string): string {
	return first
		.split(/[\s\-]+/)
		.filter(Boolean)
		.map((n) => n[0].toUpperCase() + '.')
		.join(' ');
}

// "Smith, J. A."
function apaName(a: Author): string {
	if (!a.last.trim()) return '';
	return a.first ? `${a.last}, ${initials(a.first)}` : a.last;
}

// "J. A. Smith"
function ieeeName(a: Author): string {
	if (!a.last.trim()) return '';
	return a.first ? `${initials(a.first)} ${a.last}` : a.last;
}

// "Smith JA"
function vancouverName(a: Author): string {
	if (!a.last.trim()) return '';
	if (!a.first) return a.last;
	const ini = a.first
		.split(/[\s\-]+/)
		.filter(Boolean)
		.map((n) => n[0].toUpperCase())
		.join('');
	return `${a.last} ${ini}`;
}

function apaAuthorList(authors: Author[]): string {
	const valid = authors.filter((a) => a.last.trim());
	if (!valid.length) return '';
	if (valid.length === 1) return apaName(valid[0]);
	if (valid.length <= 20) {
		return valid
			.slice(0, -1)
			.map(apaName)
			.join(', ')
			.concat(`, & ${apaName(valid[valid.length - 1])}`);
	}
	// >20 authors: first 19, ..., last
	return (
		valid
			.slice(0, 19)
			.map(apaName)
			.join(', ')
			.concat(` . . . ${apaName(valid[valid.length - 1])}`)
	);
}

function ieeeAuthorList(authors: Author[]): string {
	const valid = authors.filter((a) => a.last.trim());
	if (!valid.length) return '';
	if (valid.length > 6) {
		return valid
			.slice(0, 6)
			.map(ieeeName)
			.join(', ')
			.concat(' *et al.*');
	}
	if (valid.length === 1) return ieeeName(valid[0]);
	return valid
		.slice(0, -1)
		.map(ieeeName)
		.join(', ')
		.concat(` and ${ieeeName(valid[valid.length - 1])}`);
}

function vancouverAuthorList(authors: Author[]): string {
	const valid = authors.filter((a) => a.last.trim());
	if (!valid.length) return '';
	if (valid.length > 6) {
		return valid.slice(0, 6).map(vancouverName).join(', ').concat(', et al');
	}
	return valid.map(vancouverName).join(', ');
}

// ── Inline citations ──────────────────────────────────────────────────────

function apaInlineOne(ref: CiteRef): string {
	const authors = ref.authors.filter((a) => a.last.trim());
	const year = ref.year ?? 'n.d.';
	if (!authors.length) return `(*${ref.title}*, ${year})`;
	if (authors.length === 1) return `(${authors[0].last}, ${year})`;
	if (authors.length === 2) return `(${authors[0].last} & ${authors[1].last}, ${year})`;
	return `(${authors[0].last} et al., ${year})`;
}

function ieeeInlineNums(nums: number[]): string {
	return `[${nums.join(', ')}]`;
}

function vancouverInlineNums(nums: number[]): string {
	return `(${nums.join(', ')})`;
}

// ── Full references ───────────────────────────────────────────────────────

function dot(s: string | null | undefined): string {
	if (!s) return '';
	return s.endsWith('.') ? s : s + '.';
}

// ── APA full references ───────────────────────────────────────────────────

function apaFull(ref: CiteRef): string {
	const authors = apaAuthorList(ref.authors);
	const year = ref.year ? `(${ref.year}).` : '(n.d.).';
	const title = ref.title;

	switch (ref.type) {
		case 'article': {
			const journal = ref.journal ? `*${ref.journal}*` : '';
			const vol = ref.volume ? `, *${ref.volume}*` : '';
			const issue = ref.issue ? `(${ref.issue})` : '';
			const pages = ref.pages ? `, ${ref.pages}` : '';
			const doi = ref.doi ? ` https://doi.org/${ref.doi}` : ref.url ? ` ${ref.url}` : '';
			return `${authors} ${year} ${title}.${journal ? ' ' + journal : ''}${vol}${issue}${pages}.${doi}`;
		}
		case 'book': {
			const eds = (ref.edition ? ` (${ref.edition} ed.)` : '');
			const pub = ref.publisher ? ` ${ref.publisher}.` : '';
			return `${authors} ${year} *${title}*${eds}.${pub}`;
		}
		case 'incollection': {
			const editorList = (ref.editors ?? []).filter((e) => e.last.trim());
			const eds =
				editorList.length > 0 ? ` In ${apaAuthorList(editorList)} (Ed${editorList.length > 1 ? 's' : ''}.),` : ' In';
			const book = ref.booktitle ? ` *${ref.booktitle}*` : '';
			const pp = ref.pages ? ` (pp. ${ref.pages})` : '';
			const pub = ref.publisher ? ` ${ref.publisher}.` : '';
			return `${authors} ${year} ${title}.${eds}${book}${pp}.${pub}`;
		}
		case 'inproceedings': {
			const book = ref.booktitle ? ` *${ref.booktitle}*` : '';
			const pp = ref.pages ? ` (pp. ${ref.pages})` : '';
			const org = ref.organization ? ` ${ref.organization}.` : '';
			return `${authors} ${year} ${title}. In${book}${pp}.${org}`;
		}
		case 'phdthesis':
			return `${authors} ${year} *${title}* [Doctoral dissertation, ${ref.school ?? ''}].${ref.url ? ' ' + ref.url : ''}`;
		case 'mastersthesis':
			return `${authors} ${year} *${title}* [Master's thesis, ${ref.school ?? ''}].${ref.url ? ' ' + ref.url : ''}`;
		case 'techreport': {
			const num = ref.reportNumber ? ` (Report No. ${ref.reportNumber})` : '';
			const inst = ref.institution ? ` ${ref.institution}.` : '';
			return `${authors} ${year} *${title}*${num}.${inst}`;
		}
		default: {
			// misc / online
			const url = ref.url ? ` ${ref.url}` : '';
			return `${authors} ${year} *${title}*.${url}`;
		}
	}
}

// ── IEEE full references ──────────────────────────────────────────────────

function ieeeFull(ref: CiteRef, num: number): string {
	const authors = ieeeAuthorList(ref.authors);
	const year = ref.year ?? 'n.d.';
	const prefix = `[${num}]`;

	switch (ref.type) {
		case 'article': {
			const journal = ref.journal ? ` *${ref.journal}*,` : '';
			const vol = ref.volume ? ` vol. ${ref.volume},` : '';
			const no = ref.issue ? ` no. ${ref.issue},` : '';
			const pp = ref.pages ? ` pp. ${ref.pages},` : '';
			const doi = ref.doi ? ` doi: ${ref.doi}.` : '.';
			return `${prefix} ${authors}, "${ref.title},"${journal}${vol}${no}${pp} ${year}${doi}`;
		}
		case 'book': {
			const ed = ref.edition ? `, ${ref.edition} ed.` : '';
			const pub = ref.publisher ? ` ${ref.publisher},` : '';
			return `${prefix} ${authors}, *${ref.title}*${ed}.${pub} ${year}.`;
		}
		case 'incollection':
		case 'inproceedings': {
			const book = ref.booktitle ? ` in *${ref.booktitle}*,` : '';
			const pp = ref.pages ? ` pp. ${ref.pages},` : '';
			return `${prefix} ${authors}, "${ref.title},"${book} ${year}${pp}.`;
		}
		case 'phdthesis':
		case 'mastersthesis': {
			const kind = ref.type === 'phdthesis' ? 'Ph.D. dissertation' : 'M.S. thesis';
			const school = ref.school ? `, ${ref.school}` : '';
			return `${prefix} ${authors}, "${ref.title}," ${kind}${school}, ${year}.`;
		}
		case 'techreport': {
			const inst = ref.institution ? `, ${ref.institution}` : '';
			const num = ref.reportNumber ? `, Rep. ${ref.reportNumber}` : '';
			return `${prefix} ${authors}, "${ref.title}"${inst}${num}, ${year}.`;
		}
		default: {
			const url = ref.url ? ` [Online]. Available: ${ref.url}` : '';
			return `${prefix} ${authors}, "${ref.title}," ${year}.${url}`;
		}
	}
}

// ── Vancouver full references ─────────────────────────────────────────────

function vancouverFull(ref: CiteRef, num: number): string {
	const authors = vancouverAuthorList(ref.authors);
	const year = ref.year ?? '';
	const prefix = `${num}.`;

	switch (ref.type) {
		case 'article': {
			const journal = ref.journal ?? '';
			const vol = ref.volume ? `${ref.volume}` : '';
			const issue = ref.issue ? `(${ref.issue})` : '';
			const pp = ref.pages ? `:${ref.pages}` : '';
			const doi = ref.doi ? `. doi:${ref.doi}` : ref.url ? `. ${ref.url}` : '';
			return `${prefix} ${dot(authors)} ${dot(ref.title)} ${journal}. ${year};${vol}${issue}${pp}${doi}`;
		}
		case 'book': {
			const ed = ref.edition ? ` ${ref.edition} ed.` : '';
			const pub = ref.publisher ? ` ${ref.publisher};` : '';
			return `${prefix} ${dot(authors)} ${ref.title}${ed}.${pub} ${year}.`;
		}
		case 'incollection':
		case 'inproceedings': {
			const book = ref.booktitle ? ` In: ${ref.booktitle}` : '';
			const pp = ref.pages ? `. p. ${ref.pages}` : '';
			return `${prefix} ${dot(authors)} ${dot(ref.title)}${book}${pp}. ${year}.`;
		}
		case 'phdthesis':
		case 'mastersthesis': {
			const school = ref.school ? ` ${ref.school};` : '';
			return `${prefix} ${dot(authors)} ${ref.title} [thesis].${school} ${year}.`;
		}
		default: {
			const url = ref.url ? ` Available from: ${ref.url}` : '';
			return `${prefix} ${dot(authors)} ${dot(ref.title)}${url}. ${year}.`;
		}
	}
}

// ── Main processor ────────────────────────────────────────────────────────
//
// Finds all [@key] and [@key1; @key2] patterns in the markdown,
// replaces them with formatted inline citations, and appends a
// bibliography section at the end.
//
// Returns the modified markdown string (still needs to go through marked).

export function processCitations(
	markdown: string,
	refs: Map<string, CiteRef>,
	style: CitationStyle
): string {
	if (!refs.size) return markdown;

	// Pattern: [@key] or [@key1; @key2; ...]
	// citeKey chars: letters, digits, :, -, _, .
	const CITE_PATTERN = /\[(@[\w:._-]+(?:;\s*@[\w:._-]+)*)\]/g;

	// For numbered styles: collect unique keys in order of first appearance
	const orderedKeys: string[] = [];
	const keyIndex = new Map<string, number>(); // key → 1-based number

	// First pass: enumerate all cited keys for numbering
	if (style !== 'apa') {
		let m: RegExpExecArray | null;
		const src = markdown;
		CITE_PATTERN.lastIndex = 0;
		while ((m = CITE_PATTERN.exec(src)) !== null) {
			const keys = m[1].split(';').map((k) => k.trim().replace(/^@/, ''));
			for (const key of keys) {
				if (!keyIndex.has(key)) {
					orderedKeys.push(key);
					keyIndex.set(key, orderedKeys.length);
				}
			}
		}
	}

	// Second pass: replace patterns with inline citations
	CITE_PATTERN.lastIndex = 0;
	const usedKeys = new Set<string>();

	const result = markdown.replace(CITE_PATTERN, (_match, inner: string) => {
		const keys = inner.split(';').map((k: string) => k.trim().replace(/^@/, ''));

		if (style === 'apa') {
			const parts = keys.map((key) => {
				const ref = refs.get(key);
				if (!ref) return `[@${key}]`; // unknown key: leave as-is
				usedKeys.add(key);
				return apaInlineOne(ref).slice(1, -1); // strip outer parens for grouping
			});
			// Rejoin multiple in one bracket: (Smith, 2024; Jones, 2023)
			const allKnown = keys.every((k) => refs.has(k));
			if (!allKnown) return _match; // if any unknown, leave entire match
			return `(${parts.join('; ')})`;
		} else {
			const nums = keys
				.map((key) => {
					const n = keyIndex.get(key);
					if (n !== undefined) usedKeys.add(key);
					return n;
				})
				.filter((n): n is number => n !== undefined);
			if (!nums.length) return _match;
			return style === 'ieee' ? ieeeInlineNums(nums) : vancouverInlineNums(nums);
		}
	});

	// Build bibliography for used keys
	const bibKeys =
		style === 'apa'
			? // APA: sort by first author last name, then year
				[...usedKeys].sort((a, b) => {
					const ra = refs.get(a)!;
					const rb = refs.get(b)!;
					const la = ra.authors[0]?.last ?? ra.title;
					const lb = rb.authors[0]?.last ?? rb.title;
					return la.localeCompare(lb) || (ra.year ?? '').localeCompare(rb.year ?? '');
				})
			: // IEEE/Vancouver: in order of first citation
				orderedKeys.filter((k) => usedKeys.has(k));

	if (!bibKeys.length) return result;

	const bibLines: string[] = ['', '---', '', '## Referencias', ''];

	for (const key of bibKeys) {
		const ref = refs.get(key);
		if (!ref) continue;
		const num = keyIndex.get(key) ?? 0;

		if (style === 'apa') {
			bibLines.push(apaFull(ref));
			bibLines.push('');
		} else if (style === 'ieee') {
			bibLines.push(ieeeFull(ref, num));
			bibLines.push('');
		} else {
			bibLines.push(vancouverFull(ref, num));
			bibLines.push('');
		}
	}

	return result + bibLines.join('\n');
}

export const CITATION_STYLE_LABELS: Record<CitationStyle, string> = {
	apa: 'APA 7',
	ieee: 'IEEE',
	vancouver: 'Vancouver'
};

/**
 * Returns the fully formatted reference string for a single entry.
 * `num` is the 1-based position in the list — used by IEEE and Vancouver.
 * For APA the num is ignored.
 */
export function formatFullCitation(ref: CiteRef, style: CitationStyle, num: number): string {
	if (style === 'ieee') return ieeeFull(ref, num);
	if (style === 'vancouver') return vancouverFull(ref, num);
	return apaFull(ref);
}
