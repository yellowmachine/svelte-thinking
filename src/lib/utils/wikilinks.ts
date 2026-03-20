// ── Wikilink utilities ────────────────────────────────────────────────────
// Syntax: [[Document Title]]
// Renders as a link in the preview; indexed on commit.

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;

/** Extract all unique wikilink titles from a markdown string. */
export function extractWikilinks(markdown: string): string[] {
	const titles = new Set<string>();
	for (const match of markdown.matchAll(WIKILINK_RE)) {
		const title = match[1].trim();
		if (title) titles.add(title);
	}
	return [...titles];
}

/**
 * Replace [[Title]] with markdown links using the provided title→{id,projectId} map.
 * Unknown titles are left as plain text wrapped in a span for styling.
 */
export function processWikilinks(
	markdown: string,
	docMap: Map<string, { id: string; projectId: string }>
): string {
	return markdown.replace(WIKILINK_RE, (_match, raw: string) => {
		const title = raw.trim();
		const doc = docMap.get(title);
		if (doc) {
			return `[${title}](/projects/${doc.projectId}/documents/${doc.id})`;
		}
		// Unresolved link — render as styled text so user notices it
		return `<span class="wikilink-unresolved" title="Documento no encontrado">[[${title}]]</span>`;
	});
}
