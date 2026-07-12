import { parseHTML } from 'linkedom';

/**
 * Plain-text excerpt from a blog post's already-rendered, sanitized HTML.
 *
 * Parses (rather than regex-stripping tags) so HTML entities like &#039;
 * come out decoded — regex-stripping leaves entities in place, and Svelte's
 * attribute auto-escaping then double-encodes them (&amp;#039;) wherever the
 * excerpt is rendered as an attribute (e.g. <meta content=...>).
 */
export function excerptFromHtml(html: string, maxLength = 160): string {
	return excerptWithTruncation(html, maxLength).text;
}

/** Same as excerptFromHtml, but also reports whether the text was cut off. */
export function excerptWithTruncation(
	html: string,
	maxLength = 160
): { text: string; truncated: boolean } {
	const { document } = parseHTML(`<!DOCTYPE html><html><body>${html}</body></html>`);
	const fullText = (document.body.textContent ?? '').replace(/\s+/g, ' ').trim();
	return { text: fullText.slice(0, maxLength), truncated: fullText.length > maxLength };
}
