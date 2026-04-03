export type ExportFormat = 'latex' | 'typst';

export interface RefData {
	citeKey: string;
	type: string;
	title: string;
	authors: { first: string; last: string }[];
	editors: { first: string; last: string }[];
	year?: string | null;
	journal?: string | null;
	volume?: string | null;
	issue?: string | null;
	pages?: string | null;
	publisher?: string | null;
	booktitle?: string | null;
	school?: string | null;
	institution?: string | null;
	address?: string | null;
	edition?: string | null;
	doi?: string | null;
	url?: string | null;
	note?: string | null;
	series?: string | null;
	reportNumber?: string | null;
	isbn?: string | null;
}

// ─── Shared: BibTeX serialization ────────────────────────────────────────────

function serializeBib(refs: RefData[]): string {
	return refs
		.map((ref) => {
			const fields: string[] = [];
			const authors = (ref.authors ?? [])
				.map((a) => [a.last, a.first].filter(Boolean).join(', '))
				.join(' and ');
			if (authors) fields.push(`  author    = {${authors}}`);
			fields.push(`  title     = {${ref.title}}`);
			if (ref.year) fields.push(`  year      = {${ref.year}}`);
			if (ref.journal) fields.push(`  journal   = {${ref.journal}}`);
			if (ref.volume) fields.push(`  volume    = {${ref.volume}}`);
			if (ref.issue) fields.push(`  number    = {${ref.issue}}`);
			if (ref.pages) fields.push(`  pages     = {${ref.pages}}`);
			if (ref.publisher) fields.push(`  publisher = {${ref.publisher}}`);
			if (ref.booktitle) fields.push(`  booktitle = {${ref.booktitle}}`);
			if (ref.school) fields.push(`  school    = {${ref.school}}`);
			if (ref.institution) fields.push(`  institution = {${ref.institution}}`);
			if (ref.address) fields.push(`  address   = {${ref.address}}`);
			if (ref.edition) fields.push(`  edition   = {${ref.edition}}`);
			if (ref.doi) fields.push(`  doi       = {${ref.doi}}`);
			if (ref.url) fields.push(`  url       = {${ref.url}}`);
			if (ref.note) fields.push(`  note      = {${ref.note}}`);
			return `@${ref.type}{${ref.citeKey},\n${fields.join(',\n')}\n}`;
		})
		.join('\n\n');
}

// ─── LaTeX ────────────────────────────────────────────────────────────────────

function convertListsLatex(text: string): string {
	const lines = text.split('\n');
	const result: string[] = [];
	let inList = false;
	for (const line of lines) {
		const match = line.match(/^[-*]\s+(.+)/);
		if (match) {
			if (!inList) {
				result.push('\\begin{itemize}');
				inList = true;
			}
			result.push(`  \\item ${match[1]}`);
		} else {
			if (inList) {
				result.push('\\end{itemize}');
				inList = false;
			}
			result.push(line);
		}
	}
	if (inList) result.push('\\end{itemize}');
	return result.join('\n');
}

function mdToLatex(md: string): string {
	let t = md;

	// Protect display math $$...$$ (before any other substitutions)
	const displayMath: string[] = [];
	t = t.replace(/\$\$([\s\S]*?)\$\$/g, (_, m) => {
		displayMath.push(`\\[\n${m.trim()}\n\\]`);
		return `%%DM${displayMath.length - 1}%%`;
	});

	// Protect inline math $...$
	const inlineMath: string[] = [];
	t = t.replace(/\$([^\n$]+)\$/g, (_, m) => {
		inlineMath.push(`$${m}$`);
		return `%%IM${inlineMath.length - 1}%%`;
	});

	// Protect code blocks
	const codeBlocks: string[] = [];
	t = t.replace(/```[\w]*\n([\s\S]*?)```/g, (_, code) => {
		codeBlocks.push(`\\begin{verbatim}\n${code}\\end{verbatim}`);
		return `%%CB${codeBlocks.length - 1}%%`;
	});

	// Citations: [@key] and [@key1; @key2]
	t = t.replace(/\[@([^\]]+)\]/g, (_, keys) => {
		const cleaned = keys
			.split(';')
			.map((k: string) => k.trim().replace(/^@/, ''))
			.join(',');
		return `\\cite{${cleaned}}`;
	});

	// Wikilinks → plain title
	t = t.replace(/\[\[([^\]]+)\]\]/g, (_, c) => (c.includes(':') ? c.split(':')[0] : c));

	// Headers
	t = t.replace(/^#### (.+)$/gm, '\\subsubsection{$1}');
	t = t.replace(/^### (.+)$/gm, '\\subsubsection{$1}');
	t = t.replace(/^## (.+)$/gm, '\\subsection{$1}');
	t = t.replace(/^# (.+)$/gm, '\\section{$1}');

	// Inline formatting
	t = t.replace(/\*\*\*(.+?)\*\*\*/g, '\\textbf{\\textit{$1}}');
	t = t.replace(/\*\*(.+?)\*\*/g, '\\textbf{$1}');
	t = t.replace(/\*(.+?)\*/g, '\\textit{$1}');
	t = t.replace(/__(.+?)__/g, '\\textbf{$1}');
	t = t.replace(/_(.+?)_/g, '\\textit{$1}');

	// Inline code
	t = t.replace(/`([^`]+)`/g, '\\texttt{$1}');

	// Links
	t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '\\href{$2}{$1}');

	// Lists
	t = convertListsLatex(t);

	// Restore protected blocks
	t = t.replace(/%%CB(\d+)%%/g, (_, i) => codeBlocks[parseInt(i)]);
	t = t.replace(/%%DM(\d+)%%/g, (_, i) => displayMath[parseInt(i)]);
	t = t.replace(/%%IM(\d+)%%/g, (_, i) => inlineMath[parseInt(i)]);

	return t;
}

export function toLatex(content: string, docTitle: string, refs: RefData[]): string {
	const body = mdToLatex(content);
	const bib = serializeBib(refs);
	const hasCitations = /\\cite\{/.test(body);
	const hasBib = refs.length > 0 && hasCitations;

	// filecontents* embeds the .bib inline — fully self-contained .tex file
	const fileContents = hasBib
		? `\\begin{filecontents*}{references.bib}\n${bib}\n\\end{filecontents*}\n\n`
		: '';
	const natbibPkg = hasBib ? '\\usepackage[numbers]{natbib}\n' : '';
	const bibCmd = hasBib ? '\n\\bibliographystyle{unsrt}\n\\bibliography{references}\n' : '';

	return `${fileContents}\\documentclass[12pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{amsmath,amssymb}
\\usepackage{hyperref}
\\usepackage{geometry}
${natbibPkg}\\geometry{margin=2.5cm}

\\title{${docTitle}}
\\date{\\today}

\\begin{document}
\\maketitle

${body.trim()}
${bibCmd}
\\end{document}
`;
}

// ─── Typst ────────────────────────────────────────────────────────────────────

function mdToTypst(md: string): string {
	let t = md;

	// Protect display math $$...$$ → Typst display: $ ... $
	const displayMath: string[] = [];
	t = t.replace(/\$\$([\s\S]*?)\$\$/g, (_, m) => {
		displayMath.push(`$ ${m.trim()} $`);
		return `%%DM${displayMath.length - 1}%%`;
	});

	// Inline math stays as $...$ (Typst uses same syntax)
	const inlineMath: string[] = [];
	t = t.replace(/\$([^\n$]+)\$/g, (_, m) => {
		inlineMath.push(`$${m}$`);
		return `%%IM${inlineMath.length - 1}%%`;
	});

	// Citations: [@key] → @key, [@key1; @key2] → @key1 @key2
	t = t.replace(/\[@([^\]]+)\]/g, (_, keys) =>
		keys
			.split(';')
			.map((k: string) => `@${k.trim().replace(/^@/, '')}`)
			.join(' ')
	);

	// Wikilinks → plain title
	t = t.replace(/\[\[([^\]]+)\]\]/g, (_, c) => (c.includes(':') ? c.split(':')[0] : c));

	// Headers: # → =, ## → ==, etc.
	t = t.replace(/^#### (.+)$/gm, '==== $1');
	t = t.replace(/^### (.+)$/gm, '=== $1');
	t = t.replace(/^## (.+)$/gm, '== $1');
	t = t.replace(/^# (.+)$/gm, '= $1');

	// Bold/italic: Typst uses *bold* and _italic_
	t = t.replace(/\*\*\*(.+?)\*\*\*/g, '*_$1_*');
	t = t.replace(/\*\*(.+?)\*\*/g, '*$1*');
	// Avoid converting already-converted Typst italic markers
	t = t.replace(/(?<![*_])\*(?![*_])(.+?)(?<![*_])\*(?![*_])/g, '_$1_');

	// Links
	t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '#link("$2")[$1]');

	// Restore math
	t = t.replace(/%%DM(\d+)%%/g, (_, i) => displayMath[parseInt(i)]);
	t = t.replace(/%%IM(\d+)%%/g, (_, i) => inlineMath[parseInt(i)]);

	return t;
}

function bibToTypstStr(bib: string): string {
	// Escape for Typst string literal: backslashes and double quotes
	return bib.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

export function toTypst(content: string, docTitle: string, refs: RefData[]): string {
	const body = mdToTypst(content);
	const bib = serializeBib(refs);
	const hasCitations = /@\w/.test(body);
	const hasBib = refs.length > 0 && hasCitations;

	// bytes("...") embeds the bib inline — self-contained .typ file
	const bibSection = hasBib
		? `\n#bibliography(bytes("${bibToTypstStr(bib)}"), format: "bibtex")\n`
		: '';

	const escapedTitle = docTitle.replace(/"/g, '\\"');

	return `#set document(title: "${escapedTitle}")
#set page(paper: "a4", margin: (x: 2.5cm, y: 3cm))
#set text(font: "New Computer Modern", size: 11pt)
#set par(justify: true)

#align(center)[
  #text(size: 16pt, weight: "bold")[${docTitle}]
  #v(0.5em)
]

#v(1em)

${body.trim()}
${bibSection}`;
}
