/**
 * Epigraph processing utilities
 * Syntax: > [!epigraph]
 *         > "Quote text"
 *         > — Author
 *         > Source (optional)
 */

export interface ParsedEpigraph {
	quote: string;
	author: string;
	source: string;
	originalMarkdown: string;
}

const EPIGRAPH_PATTERN = /^>\s*\[!epigraph\]\n((?:>\s*.*\n?)*)/gm;

/**
 * Extract all epigraphs from markdown and return a map of placeholder → epigraph data
 */
export function extractEpigraphsForProcessing(
	markdown: string
): { processed: string; epigraphs: Map<string, ParsedEpigraph> } {
	const epigraphs = new Map<string, ParsedEpigraph>();
	let idx = 0;

	const processed = markdown.replace(EPIGRAPH_PATTERN, (match) => {
		const lines = match
			.split('\n')
			.slice(1) // Skip the [!epigraph] line
			.filter((line) => line.trim().startsWith('>'))
			.map((line) => line.replace(/^\s*>\s*/, ''));

		let quote = '';
		let author = '';
		let source = '';

		for (const line of lines) {
			if (line.startsWith('—') || line.startsWith('-')) {
				author = line.replace(/^[—-]\s*/, '').trim();
			} else if (author && !source) {
				source = line.trim();
			} else {
				quote += (quote ? ' ' : '') + line;
			}
		}

		// Remove surrounding quotes from quote text
		quote = quote.replace(/^"(.*)"$/s, '$1').trim();

		const id = `epigraph-${idx++}`;
		epigraphs.set(id, { quote, author, source, originalMarkdown: match });

		return `<!--epigraph:${id}-->`;
	});

	return { processed, epigraphs };
}

/**
 * Render extracted epigraphs as HTML
 */
export function renderEpigraphHTML(quote: string, author: string, source: string): string {
	const authorHtml = author ? `<span class="epigraph-author">— ${escapeHtml(author)}</span>` : '';
	const sourceHtml = source ? `<span class="epigraph-source">${escapeHtml(source)}</span>` : '';
	const figcaptionHtml =
		author || source ? `<figcaption>${authorHtml}${sourceHtml}</figcaption>` : '';

	return `<figure class="epigraph-block">
		<blockquote>
			<p>${escapeHtml(quote)}</p>
		</blockquote>
		${figcaptionHtml}
	</figure>`;
}

/**
 * Restore epigraph placeholders in HTML with rendered epigraph blocks
 */
export function restoreEpigraphs(
	html: string,
	epigraphs: Map<string, ParsedEpigraph>
): string {
	let result = html;
	for (const [id, data] of epigraphs.entries()) {
		const htmlBlock = renderEpigraphHTML(data.quote, data.author, data.source);
		result = result.replace(`<!--epigraph:${id}-->`, htmlBlock);
	}
	return result;
}

/**
 * Simple HTML escape for text content
 */
function escapeHtml(text: string): string {
	const map: Record<string, string> = {
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#039;'
	};
	return text.replace(/[&<>"']/g, (char) => map[char]);
}
