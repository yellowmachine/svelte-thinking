import { marked } from 'marked';
import markedFootnote from 'marked-footnote';
import { gfmHeadingId } from 'marked-gfm-heading-id';
import katex from 'katex';
import { parseHTML } from 'linkedom';
import { stripFrontmatter, processWikilinks, processPersonsAndIndex } from '$lib/utils/wikilinks';
import { processCitations, type CitationStyle, type CiteRef } from '$lib/utils/citations';
import { extractEpigraphsForProcessing, restoreEpigraphs } from '$lib/utils/epigraphs';
import { extractCallouts, restoreCallouts } from '$lib/utils/callouts';

marked.use(markedFootnote());
marked.use(gfmHeadingId());

export async function renderMarkdownToHtml(
	content: string,
	options: {
		docMap?: Map<string, { id: string; projectId: string }>;
		references?: Map<string, CiteRef>;
		citationStyle?: CitationStyle;
	} = {}
): Promise<string> {
	const { docMap = new Map(), references = new Map(), citationStyle = 'apa' } = options;

	let src = stripFrontmatter(content);

	// Extract math placeholders before the rest of the pipeline
	const mathBlocks = new Map<string, string>();
	let mathIdx = 0;

	src = src.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
		const id = `math-block-${mathIdx++}`;
		try {
			mathBlocks.set(
				id,
				katex.renderToString(tex.trim(), { displayMode: true, throwOnError: false })
			);
		} catch {
			mathBlocks.set(id, `<span class="math-error">LaTeX error</span>`);
		}
		return `<!--math:${id}-->`;
	});
	src = src.replace(/(?<!\$)\$(?!\$)((?:[^$\n])+?)\$(?!\$)/g, (_, tex) => {
		const id = `math-inline-${mathIdx++}`;
		try {
			mathBlocks.set(
				id,
				katex.renderToString(tex.trim(), { displayMode: false, throwOnError: false })
			);
		} catch {
			mathBlocks.set(id, `<span class="math-error">${tex}</span>`);
		}
		return `<!--math:${id}-->`;
	});

	// Pipeline (same order as MarkdownPreview, skipping Mermaid/Vega which need a browser)
	const { processed: withCalloutPlaceholders, callouts } = extractCallouts(src);
	const { processed: withEpigraphPlaceholders, epigraphs } =
		extractEpigraphsForProcessing(withCalloutPlaceholders);
	const withWikilinks =
		docMap.size > 0 ? processWikilinks(withEpigraphPlaceholders, docMap) : withEpigraphPlaceholders;
	const withPersons = processPersonsAndIndex(withWikilinks);
	const withCitations =
		references.size > 0 ? processCitations(withPersons, references, citationStyle) : withPersons;

	let html = marked.parse(withCitations) as string;

	// Restore placeholders
	html = html.replace(
		/<!--math:(math-(?:block|inline)-\d+)-->/g,
		(_, id) => mathBlocks.get(id) ?? ''
	);
	html = restoreEpigraphs(html, epigraphs);
	html = restoreCallouts(html, callouts);

	// Sanitize using linkedom as the DOM environment
	try {
		const { window } = parseHTML('<!DOCTYPE html><html><body></body></html>');
		const { default: createDOMPurify } = await import('dompurify');
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const purify = createDOMPurify(window as any);
		html = purify.sanitize(html, {
			ADD_TAGS: ['math', 'figure', 'figcaption'],
			ADD_ATTR: ['role']
		});
	} catch {
		// DOMPurify failed server-side — content is from our own pipeline, safe to use as-is
	}

	return html;
}
