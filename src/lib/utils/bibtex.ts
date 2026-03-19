// ────────────────────────────────────────────────────────────────────────────
// BibTeX parse + format utilities
// Pure functions — no server imports — safe for client and server use.
// ────────────────────────────────────────────────────────────────────────────

export type Author = { first: string; last: string };

export type ReferenceType =
	| 'article'
	| 'book'
	| 'inproceedings'
	| 'incollection'
	| 'phdthesis'
	| 'mastersthesis'
	| 'techreport'
	| 'misc';

export interface ParsedBibtex {
	citeKey: string;
	type: ReferenceType;
	title: string;
	authors: Author[];
	year: string;
	abstract: string;
	doi: string;
	url: string;
	note: string;
	// article
	journal: string;
	volume: string;
	issue: string;
	pages: string;
	// book / collection
	publisher: string;
	edition: string;
	address: string;
	isbn: string;
	editors: Author[];
	booktitle: string;
	organization: string;
	series: string;
	// thesis
	school: string;
	// techreport
	institution: string;
	reportNumber: string;
	// catch-all
	extra: Record<string, string>;
}

// ── Author string parsing ─────────────────────────────────────────────────

/**
 * Parses BibTeX author string "Last, First and Last2, First2" into Author[].
 */
export function parseAuthorString(raw: string): Author[] {
	if (!raw.trim()) return [];
	return raw.split(/\s+and\s+/i).map((a) => {
		const trimmed = a.trim();
		const commaIdx = trimmed.indexOf(',');
		if (commaIdx !== -1) {
			return {
				last: trimmed.slice(0, commaIdx).trim(),
				first: trimmed.slice(commaIdx + 1).trim()
			};
		}
		// "First Last" form — last word is the family name
		const words = trimmed.split(/\s+/);
		if (words.length === 1) return { last: words[0], first: '' };
		return { last: words[words.length - 1], first: words.slice(0, -1).join(' ') };
	});
}

/**
 * Formats Author[] back to BibTeX author string.
 */
export function formatAuthorString(authors: Author[]): string {
	return authors
		.filter((a) => a.last.trim())
		.map((a) => (a.first ? `${a.last}, ${a.first}` : a.last))
		.join(' and ');
}

// ── Known type normalizer ─────────────────────────────────────────────────

const KNOWN_TYPES: ReferenceType[] = [
	'article',
	'book',
	'inproceedings',
	'incollection',
	'phdthesis',
	'mastersthesis',
	'techreport',
	'misc'
];

function normalizeType(raw: string): ReferenceType {
	const lower = raw.toLowerCase();
	// Map common aliases
	if (lower === 'conference') return 'inproceedings';
	if (lower === 'online' || lower === 'electronic' || lower === 'www') return 'misc';
	if (lower === 'booklet' || lower === 'manual') return 'misc';
	if (lower === 'unpublished') return 'misc';
	if (lower === 'proceedings') return 'inproceedings';
	return KNOWN_TYPES.includes(lower as ReferenceType) ? (lower as ReferenceType) : 'misc';
}

// ── Core BibTeX parser ────────────────────────────────────────────────────
//
// Uses brace-depth counting to handle nested braces like {The {LaTeX} Book}.
// Supports both brace-delimited and quote-delimited field values, plus bare
// numbers (year = 2023).

/**
 * Reads a brace-balanced value starting after the opening '{'.
 * Returns [value, nextPos].
 */
function readBracedValue(src: string, pos: number): [string, number] {
	let depth = 1;
	const start = pos;
	while (pos < src.length && depth > 0) {
		const ch = src[pos];
		if (ch === '{') depth++;
		else if (ch === '}') depth--;
		pos++;
	}
	return [src.slice(start, pos - 1), pos];
}

/**
 * Parses a single BibTeX entry string (the full "@type{...}" block).
 * Returns null if the string cannot be parsed.
 */
export function parseSingleBibtexEntry(raw: string): ParsedBibtex | null {
	const trimmed = raw.trim();

	// Match the entry type
	const typeMatch = trimmed.match(/^@(\w+)\s*[{(]/i);
	if (!typeMatch) return null;
	const type = normalizeType(typeMatch[1]);

	// Find the opening delimiter position
	let pos = trimmed.indexOf(typeMatch[0].at(-1)!) + 1;

	// Read cite key (up to first comma or closing brace)
	let keyEnd = pos;
	while (keyEnd < trimmed.length && trimmed[keyEnd] !== ',' && trimmed[keyEnd] !== '}')
		keyEnd++;
	const citeKey = trimmed.slice(pos, keyEnd).trim();
	pos = keyEnd + 1; // skip comma

	// Parse fields
	const fields: Record<string, string> = {};
	const knownFields = [
		'title',
		'author',
		'editor',
		'year',
		'abstract',
		'doi',
		'url',
		'note',
		'journal',
		'volume',
		'number',
		'pages',
		'publisher',
		'edition',
		'address',
		'isbn',
		'booktitle',
		'organization',
		'series',
		'school',
		'institution'
	];

	while (pos < trimmed.length) {
		// Skip whitespace and commas
		while (pos < trimmed.length && /[\s,]/.test(trimmed[pos])) pos++;
		if (pos >= trimmed.length || trimmed[pos] === '}' || trimmed[pos] === ')') break;

		// Read field name
		let nameEnd = pos;
		while (nameEnd < trimmed.length && trimmed[nameEnd] !== '=' && !/[\s}]/.test(trimmed[nameEnd]))
			nameEnd++;
		const fieldName = trimmed.slice(pos, nameEnd).trim().toLowerCase();
		pos = nameEnd;

		// Skip whitespace and '='
		while (pos < trimmed.length && (trimmed[pos] === '=' || /\s/.test(trimmed[pos]))) pos++;

		// Read value
		let value = '';
		if (pos < trimmed.length) {
			if (trimmed[pos] === '{') {
				[value, pos] = readBracedValue(trimmed, pos + 1);
			} else if (trimmed[pos] === '"') {
				pos++; // skip opening quote
				const start = pos;
				while (pos < trimmed.length && trimmed[pos] !== '"') {
					if (trimmed[pos] === '\\') pos++;
					pos++;
				}
				value = trimmed.slice(start, pos);
				pos++; // skip closing quote
			} else {
				// Bare value (number or macro)
				const start = pos;
				while (pos < trimmed.length && !/[,}\)\s]/.test(trimmed[pos])) pos++;
				value = trimmed.slice(start, pos).trim();
			}
		}

		if (fieldName) fields[fieldName] = value;
	}

	// Map BibTeX fields → our structure
	const KNOWN_FIELD_KEYS = new Set([...knownFields, 'howpublished', 'month', 'chapter']);

	const extra: Record<string, string> = {};
	for (const [k, v] of Object.entries(fields)) {
		if (!KNOWN_FIELD_KEYS.has(k)) extra[k] = v;
	}

	return {
		citeKey,
		type,
		title: fields.title ?? '',
		authors: parseAuthorString(fields.author ?? ''),
		year: fields.year ?? '',
		abstract: fields.abstract ?? '',
		doi: fields.doi ?? '',
		url: fields.url ?? '',
		note: fields.note ?? '',
		journal: fields.journal ?? '',
		volume: fields.volume ?? '',
		issue: fields.number ?? '',
		pages: fields.pages ?? '',
		publisher: fields.publisher ?? '',
		edition: fields.edition ?? '',
		address: fields.address ?? '',
		isbn: fields.isbn ?? '',
		editors: parseAuthorString(fields.editor ?? ''),
		booktitle: fields.booktitle ?? '',
		organization: fields.organization ?? '',
		series: fields.series ?? '',
		school: fields.school ?? '',
		institution: fields.institution ?? '',
		reportNumber: fields.number ?? '',
		extra
	};
}

/**
 * Parses a .bib file containing one or more entries.
 * Skips @comment, @string, @preamble.
 */
export function parseBibtexFile(raw: string): ParsedBibtex[] {
	const results: ParsedBibtex[] = [];
	let pos = 0;

	while (pos < raw.length) {
		// Find next '@'
		const atIdx = raw.indexOf('@', pos);
		if (atIdx === -1) break;
		pos = atIdx;

		// Check type name
		const typeMatch = raw.slice(pos).match(/^@(\w+)\s*[{(]/i);
		if (!typeMatch) {
			pos++;
			continue;
		}
		const typeLower = typeMatch[1].toLowerCase();
		if (typeLower === 'comment' || typeLower === 'string' || typeLower === 'preamble') {
			pos += typeMatch[0].length;
			continue;
		}

		// Find the matching closing brace/paren by depth counting
		const openChar = typeMatch[0].at(-1)!;
		const closeChar = openChar === '{' ? '}' : ')';
		let depth = 0;
		let entryEnd = pos + typeMatch[0].length - 1; // position of opening delimiter

		for (let i = entryEnd; i < raw.length; i++) {
			if (raw[i] === openChar) depth++;
			else if (raw[i] === closeChar) {
				depth--;
				if (depth === 0) {
					entryEnd = i + 1;
					break;
				}
			}
		}

		const entryRaw = raw.slice(pos, entryEnd);
		const parsed = parseSingleBibtexEntry(entryRaw);
		if (parsed && parsed.citeKey) results.push(parsed);

		pos = entryEnd;
	}

	return results;
}

// ── BibTeX formatter ──────────────────────────────────────────────────────

interface ReferenceForExport {
	citeKey: string;
	type: string;
	title: string;
	authors: Author[];
	editors?: Author[];
	year?: string | null;
	abstract?: string | null;
	doi?: string | null;
	url?: string | null;
	note?: string | null;
	journal?: string | null;
	volume?: string | null;
	issue?: string | null;
	pages?: string | null;
	publisher?: string | null;
	edition?: string | null;
	address?: string | null;
	isbn?: string | null;
	booktitle?: string | null;
	organization?: string | null;
	series?: string | null;
	school?: string | null;
	institution?: string | null;
	reportNumber?: string | null;
	extra?: Record<string, string> | null;
}

function field(name: string, value: string | null | undefined): string | null {
	if (!value || !value.trim()) return null;
	return `  ${name} = {${value}}`;
}

/**
 * Formats a reference object as a BibTeX entry string.
 */
export function formatBibtex(ref: ReferenceForExport): string {
	const lines: (string | null)[] = [
		field('title', ref.title),
		field('author', formatAuthorString(ref.authors)),
		ref.editors?.length ? field('editor', formatAuthorString(ref.editors)) : null,
		field('year', ref.year),
		field('journal', ref.journal),
		field('booktitle', ref.booktitle),
		field('volume', ref.volume),
		field('number', ref.issue),
		field('pages', ref.pages),
		field('publisher', ref.publisher),
		field('school', ref.school),
		field('institution', ref.institution),
		field('organization', ref.organization),
		field('series', ref.series),
		field('edition', ref.edition),
		field('address', ref.address),
		field('isbn', ref.isbn),
		field('doi', ref.doi),
		field('url', ref.url),
		field('note', ref.note),
		field('abstract', ref.abstract),
		...(ref.extra ? Object.entries(ref.extra).map(([k, v]) => field(k, v)) : [])
	];

	const body = lines.filter(Boolean).join(',\n');
	return `@${ref.type}{${ref.citeKey},\n${body}\n}`;
}

/**
 * Formats an array of references as a complete .bib file string.
 */
export function formatBibtexFile(refs: ReferenceForExport[]): string {
	return refs.map(formatBibtex).join('\n\n');
}

// ── Cite key generation ───────────────────────────────────────────────────

/**
 * Auto-generates a cite key from the first author's last name + year.
 * Result is lowercased, ASCII-safe, no spaces.
 */
export function generateCiteKey(authors: Author[], year: string): string {
	const lastName = authors[0]?.last ?? 'unknown';
	// Normalize: remove diacritics, keep letters and digits only
	const normalized = lastName
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-zA-Z0-9]/g, '')
		.toLowerCase();
	const y = year ? year.replace(/\D/g, '').slice(0, 4) : '';
	return normalized + y || 'ref';
}
