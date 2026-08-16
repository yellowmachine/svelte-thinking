// ── Wikilink utilities ────────────────────────────────────────────────────

import GithubSlugger from 'github-slugger';

/** Strip YAML frontmatter (--- ... ---) from the start of a markdown string. */
export function stripFrontmatter(markdown: string): string {
	return markdown.replace(/^---\r?\n[\s\S]*?\n---[ \t]*(\r?\n|$)/, '');
}

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
		.replace(CODE_FENCE_RE, (m) => {
			slots.push(m);
			return placeholder(slots.length - 1);
		})
		.replace(CODE_SPAN_RE, (m) => {
			slots.push(m);
			return placeholder(slots.length - 1);
		});

	protected_ = fn(protected_);

	// eslint-disable-next-line no-control-regex
	return protected_.replace(/\x00CODE(\d+)\x00/g, (_, i) => slots[Number(i)]);
}
// Two supported syntaxes:
//   [[Title]]            — resolves by title (original, same-project)
//   [[doc:uuid|Title]]   — resolves by UUID (book→chapter links, stable)

// Matches [[doc:uuid|Title]]
const UUID_LINK_RE = /\[\[doc:([a-f0-9-]{36})\|([^\]]+)\]\]/g;
// Matches [[diagram:uuid|Title]] — embedded diagram, resolved separately by
// MarkdownPreview (rendered inline as SVG), not by processWikilinks.
export const DIAGRAM_LINK_RE = /\[\[diagram:([a-f0-9-]{36})\|([^\]]+)\]\]/g;
// Matches [[#Heading]] — internal section anchor
const HEADING_LINK_RE = /\[\[#([^\]]+)\]\]/g;
// Matches [[person:Name]] — named person mention
const PERSON_LINK_RE = /\[\[person:([^\]]+)\]\]/g;
// Matches [[index:persons]] — onomastic index placeholder
const INDEX_PERSONS_RE = /\[\[index:persons\]\]/g;
// Matches [[Title]] — no doc: prefix, no pipe, no #, no @, no person:, no index:
const TITLE_LINK_RE = /\[\[(?!doc:|person:|index:|@|#)([^\]|]+)\]\]/g;

// Same algorithm marked-gfm-heading-id uses (github-slugger under the hood), so
// [[#Heading]] anchors match the real heading id — a hand-rolled regex here
// previously stripped accented characters (e.g. "Introducción" → "introduccin")
// while the real id keeps them ("introducción"), silently breaking any link to
// an accented heading. Note: unlike the real per-document slugger, this doesn't
// track a running list of already-seen slugs, so it still won't disambiguate
// two headings that share the exact same title (rare, unlike the accent case).
function headingAnchor(text: string): string {
	return new GithubSlugger().slug(text.trim().toLowerCase());
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

	// Diagram embeds also reference a document by UUID — index them the same
	// way so commit-time backlinks stay accurate.
	for (const match of markdown.matchAll(DIAGRAM_LINK_RE)) {
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
	return (
		'person-' +
		name
			.trim()
			.toLowerCase()
			.replace(/\s+/g, '-')
			.replace(/[^\w-]/g, '')
	);
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

// Matches [[index:toc]] — table of contents placeholder
const INDEX_TOC_RE = /\[\[index:toc\]\]/g;

/**
 * Replace [[index:toc]] with an HTML-comment placeholder. Unlike [[index:persons]],
 * this can't be resolved in the same pre-parse pass — the real heading ids only
 * exist after marked.parse() runs (see restoreToc). Call before marked.parse().
 */
export function protectTocPlaceholder(markdown: string): string {
	return withCodeProtection(markdown, (md) => md.replace(INDEX_TOC_RE, '<!--toc-->'));
}

export interface TocHeading {
	level: number;
	id: string;
	text: string;
}

/**
 * Restore <!--toc--> placeholder(s) with a generated table of contents, built
 * from marked-gfm-heading-id's getHeadingList() output. Call after
 * marked.parse() (which populates the heading list as a side effect).
 */
export function restoreToc(html: string, headings: TocHeading[]): string {
	if (!html.includes('<!--toc-->')) return html;
	const items = headings
		.map((h) => `<li class="toc-level-${h.level}"><a href="#${h.id}">${h.text}</a></li>`)
		.join('');
	const tocHtml = `<nav class="toc"><ul>${items}</ul></nav>`;
	return html.split('<!--toc-->').join(tocHtml);
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
	let result = markdown.replace(/^[ \t]*(\[\[doc:[a-f0-9-]{36}\|[^\]]+\]\])[ \t]*$/gm, '\n$1\n');

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
