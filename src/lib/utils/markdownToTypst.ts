/**
 * Converts Markdown (with Scholio extensions) to Typst markup.
 *
 * Handles:
 * - Standard: headings, bold, italic, inline code, fenced code blocks,
 *   unordered/ordered lists, blockquotes, horizontal rules, links, display/inline math
 * - Scholio: [@citeKey] / [@k1; @k2] citations → Typst @key syntax
 * - GFM footnotes: [^id] references + [^id]: content definitions → #footnote[...]
 * - Wikilinks [[Title]] → plain text
 */
export function markdownToTypst(md: string): string {
	let src = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

	// ── 1. Protect fenced code blocks ────────────────────────────────────────
	const codeBlocks: string[] = [];
	src = src.replace(/^```(\w*)\n([\s\S]*?)^```/gm, (_m, lang, code) => {
		const escaped = code.trimEnd().replace(/\\/g, '\\\\').replace(/`/g, '\\`');
		const block = lang ? `\`\`\`${lang}\n${escaped}\n\`\`\`` : `\`\`\`\n${escaped}\n\`\`\``;
		codeBlocks.push(block);
		return `%%CB${codeBlocks.length - 1}%%`;
	});

	// ── 2. Protect display math $$ ────────────────────────────────────────────
	const displayMath: string[] = [];
	src = src.replace(/\$\$([\s\S]*?)\$\$/g, (_m, math) => {
		displayMath.push(`$ ${math.trim()} $`);
		return `%%DM${displayMath.length - 1}%%`;
	});

	// ── 3. Protect inline math $ ──────────────────────────────────────────────
	const inlineMath: string[] = [];
	src = src.replace(/\$([^\n$]+)\$/g, (_m, math) => {
		inlineMath.push(`$${math}$`);
		return `%%IM${inlineMath.length - 1}%%`;
	});

	// ── 4. Footnotes (two-pass) ───────────────────────────────────────────────
	// Collect definitions: [^id]: content (possibly multiline, indented continuation)
	const footnotes = new Map<string, string>();
	src = src.replace(/^\[\^([^\]]+)\]:([ \t])([\s\S]*?)(?=\n\[\^|\n\n[^\s]|$)/gm,
		(_m, id: string, _sep: string, body: string) => {
			// Normalize indented continuation lines
			const content = body.split('\n').map((l, i) => i === 0 ? l.trim() : l.replace(/^    /, '').trim()).filter(Boolean).join(' ');
			footnotes.set(id.trim(), content);
			return ''; // remove definition from body
		}
	);

	// Replace inline references [^id] with #footnote[content]
	src = src.replace(/\[\^([^\]]+)\]/g, (_m, id: string) => {
		const content = footnotes.get(id.trim());
		if (!content) return ''; // undefined footnote: remove silently
		const converted = inlineToTypst(content);
		return `#footnote[${converted}]`;
	});

	// ── 5. Citations [@key] / [@key1; @key2] → @key (Typst native) ───────────
	src = src.replace(/\[(@[\w:._-]+(?:;\s*@[\w:._-]+)*)\]/g, (_m, inner: string) =>
		inner
			.split(';')
			.map((k) => k.trim()) // keep the @ prefix — Typst uses @key
			.join(' ')
	);

	// ── 6. Wikilinks [[Title]] / [[Title:hash]] → plain text ─────────────────
	src = src.replace(/\[\[([^\]|]+?)(?:[:|][^\]]+)?\]\]/g, '$1');

	// ── 7. Block-level transforms ─────────────────────────────────────────────
	const lines = src.split('\n');
	const out: string[] = [];

	for (const line of lines) {
		// Headings
		const h4 = line.match(/^#### (.+)/);
		const h3 = line.match(/^### (.+)/);
		const h2 = line.match(/^## (.+)/);
		const h1 = line.match(/^# (.+)/);
		if (h4) { out.push(`==== ${inlineToTypst(h4[1])}`); continue; }
		if (h3) { out.push(`=== ${inlineToTypst(h3[1])}`); continue; }
		if (h2) { out.push(`== ${inlineToTypst(h2[1])}`); continue; }
		if (h1) { out.push(`= ${inlineToTypst(h1[1])}`); continue; }

		// Horizontal rule
		if (/^---+$/.test(line.trim())) {
			out.push('#line(length: 100%)');
			continue;
		}

		// Blockquote
		if (line.startsWith('> ')) {
			out.push(`#quote[${inlineToTypst(line.slice(2))}]`);
			continue;
		}

		// Unordered list
		const ulMatch = line.match(/^(\s*)[-*+] (.+)/);
		if (ulMatch) {
			const indent = ulMatch[1].length > 0 ? '  ' : '';
			out.push(`${indent}- ${inlineToTypst(ulMatch[2])}`);
			continue;
		}

		// Ordered list
		const olMatch = line.match(/^(\s*)\d+\. (.+)/);
		if (olMatch) {
			const indent = olMatch[1].length > 0 ? '  ' : '';
			out.push(`${indent}+ ${inlineToTypst(olMatch[2])}`);
			continue;
		}

		out.push(inlineToTypst(line));
	}

	let result = out.join('\n');

	// ── 8. Restore protected blocks ───────────────────────────────────────────
	result = result.replace(/%%CB(\d+)%%/g, (_m, i) => codeBlocks[parseInt(i)]);
	result = result.replace(/%%DM(\d+)%%/g, (_m, i) => displayMath[parseInt(i)]);
	result = result.replace(/%%IM(\d+)%%/g, (_m, i) => inlineMath[parseInt(i)]);

	return result;
}

/** Apply inline transforms to a single text fragment. */
function inlineToTypst(text: string): string {
	// Skip already-converted Typst constructs
	if (text.startsWith('```') || text.startsWith('$ ') || text.startsWith('#')) return text;

	// Inline code (before bold/italic)
	text = text.replace(/`([^`]+)`/g, '`$1`');

	// Bold+italic ***
	text = text.replace(/\*\*\*(.+?)\*\*\*/g, '*_$1_*');

	// Bold **text** or __text__
	text = text.replace(/\*\*(.+?)\*\*/g, '*$1*');
	text = text.replace(/__(.+?)__/g, '*$1*');

	// Italic *text* (not bold)
	text = text.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '_$1_');
	// Italic _text_ (not bold)
	text = text.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '_$1_');

	// Links [text](url)
	text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '#link("$2")[$1]');

	return text;
}
