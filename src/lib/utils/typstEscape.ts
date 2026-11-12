/**
 * Escaping for text that goes into Typst markup.
 *
 * Markdown and Typst share `*`, `_`, backticks, `\` escapes and list markers,
 * so those are left for the converters. What breaks a Typst compile is the
 * rest: `@` (a reference: `a@b.com` → "label does not exist"), `#` (code),
 * `$` (math), `<` (a label), `~` (no-break space) and `//` or `/*` (comments).
 */

/** Plain-text characters that Typst would read as syntax. */
const SPECIAL = /[@#$<~]|\/(?=[/*])/g;

/**
 * Pieces that must reach the converters untouched: inline code, link targets
 * `](url)` and `%%PLACEHOLDER%%` tokens. Everything between them is escaped.
 */
const KEEP = /`[^`\n]+`|\]\([^)\s]*\)|%%[A-Z_]+\d*%%/g;

function escapeChunk(text: string): string {
	return text.replace(SPECIAL, (c, offset: number, whole: string) =>
		// Keep URLs readable: Typst already treats "https://" as a link.
		c === '/' && whole[offset - 1] === ':' ? c : `\\${c}`
	);
}

/** Escapes one line of Markdown text, keeping a leading `#` heading marker. */
export function escapeTypstLine(line: string): string {
	const heading = line.match(/^(#{1,6} )/);
	const prefix = heading ? heading[1] : '';
	const rest = line.slice(prefix.length);

	let out = '';
	let last = 0;
	for (const m of rest.matchAll(KEEP)) {
		out += escapeChunk(rest.slice(last, m.index)) + m[0];
		last = m.index! + m[0].length;
	}
	return prefix + out + escapeChunk(rest.slice(last));
}

/** Escapes multi-line Markdown text line by line. */
export function escapeTypstText(text: string): string {
	return text.split('\n').map(escapeTypstLine).join('\n');
}

/**
 * Renders a citation group: `@key` for keys the bibliography has, plain text
 * for the rest (an unknown `@key` stops the whole compile). With no `known`
 * set, every key is trusted.
 */
export function typstCitation(keys: string[], known?: Set<string>): string {
	return keys.map((k) => (!known || known.has(k) ? `@${k}` : `\\[${escapeChunk(k)}\\]`)).join(' ');
}
