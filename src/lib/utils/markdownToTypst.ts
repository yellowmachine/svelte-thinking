/**
 * Converts Markdown (with Scholio extensions) to Typst markup.
 *
 * Handles:
 * - Standard: headings, bold, italic, inline code, fenced code blocks,
 *   unordered/ordered lists, blockquotes, horizontal rules, links, images, display/inline math
 * - Scholio: [@citeKey] / [@k1; @k2] citations → Typst @key syntax
 * - GFM footnotes: [^id] references + [^id]: content definitions → #footnote[...]
 * - Wikilinks [[Title]] → plain text
 *
 * @param imageRegistry  Optional map (localFilename → remoteUrl) populated as images are found.
 *                       The caller passes it to compileToPdf so the microservice can download them.
 */
export function markdownToTypst(md: string, imageRegistry?: Map<string, string>): string {
	let src = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
	src = src.replace(/^---\r?\n[\s\S]*?\n---[ \t]*(\r?\n|$)/, '');

	// ── 0. Protect images ![alt](url) ────────────────────────────────────────
	// Must run before the link regex in inlineToTypst would match [alt](url)
	const imagePlaceholders: string[] = [];
	src = src.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt: string, url: string) => {
		const localName = imageRegistry ? registerImage(url, imageRegistry) : `img-${imagePlaceholders.length}${extOf(url)}`;
		const typstImg = alt.trim()
			? `#figure(image("${localName}"), caption: [${alt.trim()}])`
			: `#image("${localName}")`;
		imagePlaceholders.push(typstImg);
		return `%%IMG${imagePlaceholders.length - 1}%%`;
	});

	// ── 0.4 Protect callout blocks ([!note], [!warning], [!tip], [!caution]) ──
	const calloutBlocks: string[] = [];
	src = src.replace(
		/^>\s*\[!(note|warning|tip|caution)\]\n((?:>\s*.*\n?)*)/gim,
		(_m, type: string, body: string) => {
			const lines = body
				.split('\n')
				.filter((l: string) => l.trim().startsWith('>'))
				.map((l: string) => l.replace(/^\s*>\s?/, '').trimEnd())
				.filter(Boolean);
			const content = lines.map(inlineToTypst).join('\n\n');
			const labels: Record<string, string> = {
				note: 'Nota',
				warning: 'Atención',
				tip: 'Consejo',
				caution: 'Precaución'
			};
			const fills: Record<string, string> = {
				note: 'rgb("#e8f0fe")',
				warning: 'rgb("#fff8e1")',
				tip: 'rgb("#e8f5e9")',
				caution: 'rgb("#fce4e4")'
			};
			const strokes: Record<string, string> = {
				note: 'rgb("#4a7fb5")',
				warning: 'rgb("#c87d00")',
				tip: 'rgb("#2e7d32")',
				caution: 'rgb("#c0392b")'
			};
			const label = labels[type.toLowerCase()] ?? type;
			const fill = fills[type.toLowerCase()] ?? 'rgb("#f5f5f5")';
			const stroke = strokes[type.toLowerCase()] ?? 'rgb("#888")';
			const typstBlock = `#block(fill: ${fill}, stroke: (left: 3pt + ${stroke}), inset: (left: 10pt, top: 8pt, bottom: 8pt, right: 8pt), radius: 3pt, width: 100%)[*${label}:* ${content}]`;
			calloutBlocks.push(typstBlock);
			return `%%CALLOUT${calloutBlocks.length - 1}%%`;
		}
	);

	// ── 0.5 Protect epigraph blocks (multiline blockquotes with [!epigraph]) ──
	const epigraphs: string[] = [];
	src = src.replace(/^> \[!epigraph\]\n((?:> [^\n]*\n?)*)/gm, (_m, body: string) => {
		const lines = body.split('\n').filter(l => l.startsWith('> ')).map(l => l.slice(2).trim()).filter(Boolean);
		if (lines.length === 0) return _m; // fallback if no lines

		const typstEpigraph = renderEpigraphToTypst(lines);
		epigraphs.push(typstEpigraph);
		return `%%EPIGRAPH${epigraphs.length - 1}%%`;
	});

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

	// ── 6. Wikilinks ─────────────────────────────────────────────────────────

	// 6a. [[person:Name]] → Typst inline with label for page-index tracking.
	//     Collected names are used in step 8 to build [[index:persons]].
	//     Use a placeholder so inlineToTypst (step 7) doesn't touch the Typst syntax.
	const personNames: string[] = [];
	const personSet = new Set<string>();
	const personPlaceholders: string[] = [];
	src = src.replace(/\[\[person:([^\]]+)\]\]/g, (_m, name: string) => {
		const trimmed = name.trim();
		if (!personSet.has(trimmed)) {
			personSet.add(trimmed);
			personNames.push(trimmed);
		}
		const lbl = personNameToLabel(trimmed);
		personPlaceholders.push(`${escapeTypstName(trimmed)}#label("${lbl}")`);
		return `%%PP${personPlaceholders.length - 1}%%`;
	});

	// 6b. [[index:persons]] → placeholder resolved in step 8 with collected names
	src = src.replace(/\[\[index:persons\]\]/g, '%%PERSONS_INDEX%%');

	// 6c. Generic wikilinks [[Title]] / [[Title:hash]] → plain text
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
	result = result.replace(/%%IMG(\d+)%%/g, (_m, i) => imagePlaceholders[parseInt(i)]);
	result = result.replace(/%%CB(\d+)%%/g, (_m, i) => codeBlocks[parseInt(i)]);
	result = result.replace(/%%DM(\d+)%%/g, (_m, i) => displayMath[parseInt(i)]);
	result = result.replace(/%%IM(\d+)%%/g, (_m, i) => inlineMath[parseInt(i)]);
	result = result.replace(/%%CALLOUT(\d+)%%/g, (_m, i) => calloutBlocks[parseInt(i)]);
	result = result.replace(/%%EPIGRAPH(\d+)%%/g, (_m, i) => epigraphs[parseInt(i)]);
	result = result.replace(/%%PP(\d+)%%/g, (_m, i) => personPlaceholders[parseInt(i)]);
	result = result.replace(/%%PERSONS_INDEX%%/g, () => generatePersonsIndex(personNames));

	return result;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse epigraph lines (quote, author, source) and render to Typst. */
function renderEpigraphToTypst(lines: string[]): string {
	if (lines.length === 0) return '';

	// Detect attribution line (starts with — or --)
	const attrIdx = lines.findIndex(l => /^[—–-]/.test(l));
	let quoteLines: string[];
	let attr: string;
	if (attrIdx >= 0) {
		// Explicit attribution found
		quoteLines = lines.slice(0, attrIdx);
		attr = lines[attrIdx];
	} else if (lines.length === 1) {
		// Single line — treat as quote with no attribution
		quoteLines = lines;
		attr = '';
	} else {
		// No explicit attribution — treat last line as attribution
		quoteLines = lines.slice(0, -1);
		attr = lines[lines.length - 1];
	}
	const source = attrIdx >= 0 && lines.length > attrIdx + 1 ? lines.slice(attrIdx + 1).join(' ') : '';

	const quote = quoteLines.map(l => l.replace(/^[""]|[""]$/g, '')).join(' ').trim();

	if (!quote) return '';

	const attributionParts = [attr, source].filter(Boolean).map(escapeTypstStringHelper);
	const attribution = attributionParts.length > 0
		? `, attribution: [${attributionParts.join(', ')}]`
		: '';

	return `#quote(block: true${attribution})[${escapeTypstStringHelper(quote)}]`;
}

function escapeTypstStringHelper(s: string): string {
	return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

function extOf(url: string): string {
	const m = url.match(/\.(\w{2,5})(?:\?|#|$)/);
	return m ? `.${m[1].toLowerCase()}` : '.png';
}

/** Returns the local filename for a URL, registering it if new. */
function registerImage(url: string, registry: Map<string, string>): string {
	for (const [name, u] of registry) if (u === url) return name;
	const name = `img-${registry.size}${extOf(url)}`;
	registry.set(name, url);
	return name;
}

/** Converts a person name to a safe Typst label identifier. */
function personNameToLabel(name: string): string {
	return 'spp-' + name
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '') // strip diacritics
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/** Escapes Typst special characters that can appear in person names. */
function escapeTypstName(name: string): string {
	return name
		.replace(/#/g, '\\#')
		.replace(/\[/g, '\\[')
		.replace(/\]/g, '\\]')
		.replace(/@/g, '\\@');
}

/**
 * Generates a Typst `context` block that queries all [[person:Name]] label
 * occurrences and renders a two-column grid (name / page numbers).
 * Requires Typst ≥ 0.11.
 */
function generatePersonsIndex(names: string[]): string {
	if (names.length === 0) return '';

	const sorted = [...names].sort((a, b) => a.localeCompare(b));

	const entries = sorted
		.map((n) => {
			const lbl = personNameToLabel(n);
			const escaped = n.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
			return `("${escaped}", "${lbl}")`;
		})
		.join(', ');

	return `#context {
  let _spp = (${entries},)
  let _cells = ()
  for (_spp_name, _spp_lbl) in _spp {
    let _spp_hits = query(label(_spp_lbl))
    if _spp_hits.len() > 0 {
      let _spp_pages = _spp_hits.map(h => h.location().page()).sorted().dedup()
      _cells.push([#_spp_name])
      _cells.push([#_spp_pages.map(p => str(p)).join(", ")])
    }
  }
  if _cells.len() > 0 {
    grid(columns: (1fr, auto), row-gutter: 0.4em, .._cells)
  }
}`;
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
