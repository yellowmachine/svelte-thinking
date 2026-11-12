/**
 * Inline citation syntax shared by the preview, the exporters and the AI prompts.
 *
 * The canonical form is `[[@key]]` (or `[[@key1; @key2]]`): it is what the
 * editor inserts and what the preview renders. Exporters also accept the
 * Pandoc form `[@key]`, which older docs and AI answers used.
 */

const KEYS = String.raw`@[\w:._-]+(?:;\s*@[\w:._-]+)*`;

/** Matches `[[@a; @b]]` (group 1) or `[@a; @b]` (group 2). */
const CITATION_RE = new RegExp(String.raw`\[\[(${KEYS})\]\]|\[(${KEYS})\]`, 'g');

export function citationToken(citeKey: string): string {
	return `[[@${citeKey}]]`;
}

/** Replaces every citation with `render(keys)`, where keys come without the `@`. */
export function replaceCitations(text: string, render: (keys: string[]) => string): string {
	return text.replace(CITATION_RE, (_m, doubled: string | undefined, single: string | undefined) =>
		render(
			(doubled ?? single ?? '')
				.split(';')
				.map((k) => k.trim().replace(/^@/, ''))
				.filter(Boolean)
		)
	);
}
