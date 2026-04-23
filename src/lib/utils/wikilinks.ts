// ── Wikilink utilities ────────────────────────────────────────────────────

// Matches fenced code blocks (``` or ~~~) and inline code spans (`...`)
const CODE_FENCE_RE = /^(```|~~~)[^\n]*\n[\s\S]*?\n\1\s*$/gm;
const CODE_SPAN_RE = /`+[^`]*`+/g;

/**
 * Replace all code spans and fenced blocks with unique placeholders,
 * run `fn` on the result, then restore the originals.
 * This prevents wikilink/person regexes from firing inside code.
 */
export function withCodeProtection(text: string, fn: (s: string) => string): string {
	const slots: string[] = [];
	const placeholder = (i: number) => `\x00CODE${i}\x00`;

	let protected_ = text
		.replace(CODE_FENCE_RE, (m) => { slots.push(m); return placeholder(slots.length - 1); })
		.replace(CODE_SPAN_RE, (m) => { slots.push(m); return placeholder(slots.length - 1); });

	protected_ = fn(protected_);

	return protected_.replace(/\x00CODE(\d+)\x00/g, (_, i) => slots[Number(i)]);
}
// Two supported syntaxes:
//   [[Title]]            — resolves by title (original, same-project)
//   [[doc:uuid|Title]]   — resolves by UUID (book→chapter links, stable)

// Matches [[doc:uuid|Title]]
const UUID_LINK_RE = /\[\[doc:([a-f0-9-]{36})\|([^\]]+)\]\]/g;
// Matches [[#Heading]] — internal section anchor
const HEADING_LINK_RE = /\[\[#([^\]]+)\]\]/g;
// Matches [[person:Name]] — named person mention
const PERSON_LINK_RE = /\[\[person:([^\]]+)\]\]/g;
// Matches [[index:persons]] — onomastic index placeholder
const INDEX_PERSONS_RE = /\[\[index:persons\]\]/g;
// Matches [[Title]] — no doc: prefix, no pipe, no #, no @, no person:, no index:
const TITLE_LINK_RE = /\[\[(?!doc:|person:|index:|@|#)([^\]|]+)\]\]/g;

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

/** Returns a stable HTML id for a person name, e.g. "John Doe" → "person-john-doe". */
export function personAnchorId(name: string): string {
	return 'person-' + name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
}

/**
 * Replace [[person:Name]] with styled spans (anchoring the first occurrence),
 * and replace [[index:persons]] with a sorted onomastic index linking to those anchors.
 */
export function processPersonsAndIndex(markdown: string): string {
	return withCodeProtection(markdown, (md) => _processPersonsAndIndex(md));
}

function _processPersonsAndIndex(markdown: string): string {
	const seen = new Set<string>();

	const withPersons = markdown.replace(PERSON_LINK_RE, (_match, name: string) => {
		const trimmed = name.trim();
		if (!seen.has(trimmed)) {
			seen.add(trimmed);
			return `<span id="${personAnchorId(trimmed)}" class="mention-person">${trimmed}</span>`;
		}
		return `<span class="mention-person">${trimmed}</span>`;
	});

	if (!withPersons.includes('[[index:persons]]')) return withPersons;

	const sorted = [...seen].sort((a, b) => a.localeCompare(b));
	const listItems = sorted
		.map((name) => `<li><a href="#${personAnchorId(name)}">${name}</a></li>`)
		.join('');
	const indexHtml = `<nav class="persons-index"><ol>${listItems}</ol></nav>`;

	return withPersons.replace(INDEX_PERSONS_RE, indexHtml);
}

/**
 * Replace [[Title]] and [[doc:uuid|Title]] with markdown links.
 * The docMap should contain entries keyed by both title AND uuid for full resolution.
 * Unknown links are left as styled unresolved spans.
 * Note: [[person:Name]] and [[index:persons]] are handled separately by processPersonsAndIndex.
 */
export function processWikilinks(
	markdown: string,
	docMap: Map<string, { id: string; projectId: string }>
): string {
	return withCodeProtection(markdown, (md) => _processWikilinks(md, docMap));
}

function _processWikilinks(
	markdown: string,
	docMap: Map<string, { id: string; projectId: string }>
): string {
	// Pre-pass: [[doc:...]] tokens alone on a line must be wrapped in blank lines
	// so marked treats each as its own paragraph instead of collapsing them into one.
	let result = markdown.replace(
		/^[ \t]*(\[\[doc:[a-f0-9-]{36}\|[^\]]+\]\])[ \t]*$/gm,
		'\n$1\n'
	);

	// First pass: resolve [[#Heading]] → markdown anchor links
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
