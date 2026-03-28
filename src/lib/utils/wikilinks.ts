// ── Wikilink utilities ────────────────────────────────────────────────────
// Two supported syntaxes:
//   [[Title]]            — resolves by title (original, same-project)
//   [[doc:uuid|Title]]   — resolves by UUID (book→chapter links, stable)

// Matches [[doc:uuid|Title]]
const UUID_LINK_RE = /\[\[doc:([a-f0-9-]{36})\|([^\]]+)\]\]/g;
// Matches [[#Heading]] — internal section anchor
const HEADING_LINK_RE = /\[\[#([^\]]+)\]\]/g;
// Matches [[person:Name]] — named person mention
const PERSON_LINK_RE = /\[\[person:([^\]]+)\]\]/g;
// Matches [[Title]] — no doc: prefix, no pipe, no #, no @, no person:
const TITLE_LINK_RE = /\[\[(?!doc:|person:|@|#)([^\]|]+)\]\]/g;

function headingAnchor(text: string): string {
	return text.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
}

/** Extract all link targets from a markdown string.
 *  Returns UUIDs (from [[doc:uuid|...]]) and titles (from [[Title]]).
 *  Used to build the documentLink index on commit. */
export function extractWikilinks(markdown: string): { uuids: string[]; titles: string[] } {
	const uuids = new Set<string>();
	const titles = new Set<string>();

	for (const match of markdown.matchAll(UUID_LINK_RE)) {
		const uuid = match[1].trim();
		if (uuid) uuids.add(uuid);
	}

	// Reset lastIndex before second pass (matchAll resets, but being explicit)
	for (const match of markdown.matchAll(TITLE_LINK_RE)) {
		const title = match[1].trim();
		if (title) titles.add(title);
	}

	return { uuids: [...uuids], titles: [...titles] };
}

/**
 * Replace [[Title]] and [[doc:uuid|Title]] with markdown links.
 * The docMap should contain entries keyed by both title AND uuid for full resolution.
 * Unknown links are left as styled unresolved spans.
 */
export function processWikilinks(
	markdown: string,
	docMap: Map<string, { id: string; projectId: string }>
): string {
	// First pass: resolve [[person:Name]] → styled span
	let result = markdown.replace(PERSON_LINK_RE, (_match, name: string) => {
		return `<span class="mention-person">${name.trim()}</span>`;
	});

	// Second pass: resolve [[#Heading]] → markdown anchor links
	result = result.replace(HEADING_LINK_RE, (_match, heading: string) => {
		return `[${heading.trim()}](#${headingAnchor(heading)})`;
	});

	// Second pass: resolve [[doc:uuid|Title]] links
	result = result.replace(UUID_LINK_RE, (_match, uuid: string, title: string) => {
		const doc = docMap.get(uuid.trim());
		if (doc) {
			return `[${title.trim()}](/projects/${doc.projectId}/documents/${doc.id})`;
		}
		return `<span class="wikilink-unresolved" title="Chapter not found">[[doc:${uuid}|${title}]]</span>`;
	});

	// Third pass: resolve [[Title]] links
	result = result.replace(TITLE_LINK_RE, (_match, raw: string) => {
		const title = raw.trim();
		const doc = docMap.get(title);
		if (doc) {
			return `[${title}](/projects/${doc.projectId}/documents/${doc.id})`;
		}
		return `<span class="wikilink-unresolved" title="Document not found">[[${title}]]</span>`;
	});

	return result;
}
