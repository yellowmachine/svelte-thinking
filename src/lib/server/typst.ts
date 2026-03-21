import { env } from '$env/dynamic/private';
import type { RefData } from '$lib/utils/export';
import type { TemplateType } from '$lib/server/trpc/routers/requirements';

const TYPST_URL = env.TYPST_SERVICE_URL ?? 'http://localhost:3100';

export interface TypstSection {
	title: string;
	content: string; // already converted to Typst markup
}

export interface TypstDocumentOptions {
	title: string;
	description?: string | null;
	date?: string;
	authors?: string[];
	doi?: string;
	version?: string;
	sections: TypstSection[];
	refs?: RefData[];
	template?: TemplateType;
}

// ---------------------------------------------------------------------------
// Shared title-block helpers
// ---------------------------------------------------------------------------

function authorsBlock(authors: string[] | undefined): string {
	if (!authors?.length) return '';
	const line = authors.map(escapeTypstString).join(' · ');
	return `\n  #v(0.5em)\n  #text(size: 10pt)[${line}]`;
}

function metaLine(opts: TypstDocumentOptions, date: string): string {
	const parts: string[] = [date];
	if (opts.version) parts.push(`v${escapeTypstString(opts.version)}`);
	if (opts.doi)     parts.push(`DOI: ${escapeTypstString(opts.doi)}`);
	return `#text(size: 9pt, fill: luma(120))[${parts.join(' · ')}]`;
}

/** Returns the abstract section if one exists (title matches "abstract" or "resumen"). */
function extractAbstract(sections: TypstSection[]): { abstract: TypstSection | null; rest: TypstSection[] } {
	const idx = sections.findIndex((s) =>
		/^(abstract|resumen|summary|sommaire|zusammenfassung)$/i.test(s.title.trim())
	);
	if (idx === -1) return { abstract: null, rest: sections };
	const abstract = sections[idx];
	const rest = sections.filter((_, i) => i !== idx);
	return { abstract, rest };
}

function renderSections(sections: TypstSection[]): string {
	return sections
		.map((s) => `== ${s.title}\n\n${s.content.trim()}`)
		.join('\n\n#v(1em)\n\n');
}

function abstractBlock(abstract: TypstSection | null): string {
	if (!abstract) return '';
	return `\
#block(
  width: 100%,
  inset: (x: 1.2em, y: 0.8em),
  stroke: (left: 2pt + luma(180)),
  fill: luma(248),
)[
  #text(size: 9pt, weight: "bold")[${abstract.title.toUpperCase()}]
  #v(0.3em)
  #text(size: 9pt)[${abstract.content.trim()}]
]

#v(0.8em)

`;
}

// ---------------------------------------------------------------------------
// Template builders
// ---------------------------------------------------------------------------

function templatePaper(opts: TypstDocumentOptions, sections: TypstSection[], bibStr: string): string {
	const date = opts.date ?? new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
	const { abstract, rest } = extractAbstract(sections);
	return `\
#set document(title: "${escapeTypstString(opts.title)}")
#set page(paper: "a4", margin: (x: 2cm, y: 2.5cm), numbering: "1", number-align: center)
#set text(font: "Linux Libertine", size: 10pt, lang: "es")
#set heading(numbering: "1.")
#set par(justify: true, leading: 0.6em, spacing: 1em)
#show heading.where(level: 1): it => { v(1.2em, weak: true); it; v(0.4em, weak: true) }
#show heading.where(level: 2): it => { v(0.8em, weak: true); it; v(0.3em, weak: true) }

#align(center)[
  #v(1cm)
  #text(size: 16pt, weight: "bold")[${escapeTypstString(opts.title)}]
  ${opts.description ? `\n  #v(0.4em)\n  #text(size: 10pt, fill: luma(80), style: "italic")[${escapeTypstString(opts.description)}]` : ''}${authorsBlock(opts.authors)}
  #v(0.3em)
  ${metaLine(opts, date)}
  #v(0.6cm)
  #line(length: 100%, stroke: 0.4pt + luma(180))
  #v(0.6cm)
]

${abstractBlock(abstract)}${renderSections(rest)}
${bibStr}`;
}

function templateThesis(opts: TypstDocumentOptions, sections: TypstSection[], bibStr: string): string {
	const date = opts.date ?? new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
	const { abstract, rest } = extractAbstract(sections);
	return `\
#set document(title: "${escapeTypstString(opts.title)}")
#set page(
  paper: "a4",
  margin: (top: 3cm, bottom: 3cm, left: 3.5cm, right: 2.5cm),
  numbering: "1",
  number-align: center,
  header: context {
    if counter(page).get().first() > 1 {
      align(right, text(size: 9pt, fill: luma(140))[${escapeTypstString(opts.title)}])
      v(-0.4em)
      line(length: 100%, stroke: 0.3pt + luma(200))
    }
  }
)
#set text(font: "Linux Libertine", size: 12pt, lang: "es")
#set heading(numbering: "1.1.")
#set par(justify: true, leading: 0.75em, spacing: 1.4em, first-line-indent: 1.5em)
#show heading.where(level: 1): it => {
  pagebreak(weak: true)
  v(2em, weak: true)
  set text(size: 16pt, weight: "bold")
  it
  v(0.8em, weak: true)
}
#show heading.where(level: 2): it => {
  v(1.2em, weak: true)
  set text(size: 13pt, weight: "bold")
  it
  v(0.5em, weak: true)
}

// ── Portada ────────────────────────────────────────────────────────────────
#page(numbering: none)[
  #align(center + horizon)[
    #v(3cm)
    #text(size: 22pt, weight: "bold")[${escapeTypstString(opts.title)}]
    ${opts.description ? `\n    #v(1em)\n    #text(size: 13pt, fill: luma(80))[${escapeTypstString(opts.description)}]` : ''}${authorsBlock(opts.authors)}
    #v(2cm)
    #line(length: 40%, stroke: luma(200))
    #v(1cm)
    ${metaLine(opts, date)}
  ]
]

// ── Resumen ────────────────────────────────────────────────────────────────
${abstractBlock(abstract)}
// ── Índice ─────────────────────────────────────────────────────────────────
#outline(title: "Índice", depth: 2, indent: 1em)
#pagebreak()

${renderSections(rest)}
${bibStr}`;
}

function templateMedical(opts: TypstDocumentOptions, sections: TypstSection[], bibStr: string): string {
	const date = opts.date ?? new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
	const { abstract, rest } = extractAbstract(sections);
	return `\
#set document(title: "${escapeTypstString(opts.title)}")
#set page(paper: "a4", margin: (x: 2.5cm, y: 3cm), numbering: "1", number-align: center)
#set text(font: "Linux Libertine", size: 11pt, lang: "es")
#set heading(numbering: none)
#set par(justify: true, leading: 0.7em, spacing: 1.1em)
#show heading.where(level: 1): it => {
  v(1.4em, weak: true)
  set text(size: 11pt, weight: "bold")
  upper(it.body)
  v(0.4em, weak: true)
  line(length: 100%, stroke: 0.5pt + luma(200))
  v(0.2em, weak: true)
}
#show heading.where(level: 2): it => {
  v(0.8em, weak: true)
  set text(size: 11pt, weight: "bold", style: "italic")
  it
  v(0.3em, weak: true)
}

#align(center)[
  #v(0.5cm)
  #text(size: 15pt, weight: "bold")[${escapeTypstString(opts.title)}]
  ${opts.description ? `\n  #v(0.4em)\n  #text(size: 10pt, fill: luma(80))[${escapeTypstString(opts.description)}]` : ''}${authorsBlock(opts.authors)}
  #v(0.3em)
  ${metaLine(opts, date)}
  #v(0.5cm)
  #line(length: 100%, stroke: 0.8pt)
  #v(0.3cm)
]

${abstractBlock(abstract)}${renderSections(rest)}
${bibStr}`;
}

function templateReport(opts: TypstDocumentOptions, sections: TypstSection[], bibStr: string): string {
	const date = opts.date ?? new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
	return `\
#set document(title: "${escapeTypstString(opts.title)}")
#set page(
  paper: "a4",
  margin: (x: 2.5cm, y: 3cm),
  numbering: "1",
  number-align: center,
  footer: context {
    line(length: 100%, stroke: 0.3pt + luma(200))
    v(-0.4em)
    grid(
      columns: (1fr, 1fr, 1fr),
      align(left, text(size: 8pt, fill: luma(140))[${escapeTypstString(opts.title)}]),
      align(center, text(size: 8pt, fill: luma(140))[${date}]),
      align(right, text(size: 8pt, fill: luma(140))[Página #counter(page).display()])
    )
  }
)
#set text(font: "Linux Libertine", size: 11pt, lang: "es")
#set heading(numbering: "1.1.")
#set par(justify: true, leading: 0.7em, spacing: 1.2em)
#show heading.where(level: 1): it => {
  v(1.5em, weak: true)
  set text(size: 13pt, weight: "bold")
  it
  v(0.5em, weak: true)
}

// ── Portada ────────────────────────────────────────────────────────────────
#page(numbering: none, footer: none)[
  #rect(width: 100%, height: 1cm, fill: luma(30))
  #v(3cm)
  #align(left)[
    #text(size: 24pt, weight: "bold")[${escapeTypstString(opts.title)}]
    ${opts.description ? `\n    #v(0.6em)\n    #text(size: 13pt, fill: luma(80))[${escapeTypstString(opts.description)}]` : ''}${authorsBlock(opts.authors)}
    #v(2cm)
    #text(size: 10pt, fill: luma(120))[${date}]
  ]
  #align(bottom)[
    #line(length: 100%, stroke: 1.5pt + luma(30))
  ]
]

// ── Índice ─────────────────────────────────────────────────────────────────
#outline(title: "Contenido", depth: 2, indent: 1.5em)
#pagebreak()

${renderSections(sections)}
${bibStr}`;
}

function templateGeneric(opts: TypstDocumentOptions, sections: TypstSection[], bibStr: string): string {
	const date = opts.date ?? new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
	const { abstract, rest } = extractAbstract(sections);
	return `\
#set document(title: "${escapeTypstString(opts.title)}")
#set page(margin: (x: 2.5cm, y: 3cm), numbering: "1", number-align: center)
#set text(font: "Linux Libertine", size: 11pt, lang: "es")
#set heading(numbering: "1.")
#set par(justify: true, leading: 0.75em, spacing: 1.2em)
#show heading.where(level: 1): it => { v(1.5em, weak: true); it; v(0.5em, weak: true) }
#show heading.where(level: 2): it => { v(1.2em, weak: true); it; v(0.4em, weak: true) }

#align(center)[
  #v(2cm)
  #text(size: 20pt, weight: "bold")[${escapeTypstString(opts.title)}]
  ${opts.description ? `\n  #v(0.6em)\n  #text(size: 12pt, fill: luma(80))[${escapeTypstString(opts.description)}]` : ''}${authorsBlock(opts.authors)}
  #v(0.4em)
  ${metaLine(opts, date)}
  #v(1cm)
  #line(length: 60%, stroke: luma(180))
  #v(2cm)
]

${abstractBlock(abstract)}${renderSections(rest)}
${bibStr}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildTypstSource(opts: TypstDocumentOptions): string {
	const bibStr = buildBibSection(opts);

	switch (opts.template) {
		case 'paper':   return templatePaper(opts, opts.sections, bibStr);
		case 'thesis':  return templateThesis(opts, opts.sections, bibStr);
		case 'medical': return templateMedical(opts, opts.sections, bibStr);
		case 'report':  return templateReport(opts, opts.sections, bibStr);
		default:        return templateGeneric(opts, opts.sections, bibStr);
	}
}

export async function compileToPdf(
	typstSource: string,
	images?: Record<string, string>
): Promise<Uint8Array> {
	const hasImages = images && Object.keys(images).length > 0;

	const res = await fetch(`${TYPST_URL}/compile`, {
		method: 'POST',
		headers: { 'Content-Type': hasImages ? 'application/json' : 'text/plain; charset=utf-8' },
		body: hasImages ? JSON.stringify({ source: typstSource, images }) : typstSource
	});

	if (!res.ok) {
		const msg = await res.text().catch(() => `HTTP ${res.status}`);
		throw new Error(`Typst compile error: ${msg}`);
	}

	return new Uint8Array(await res.arrayBuffer());
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildBibSection(opts: TypstDocumentOptions): string {
	if (!opts.refs?.length) return '';

	const allContent = opts.sections.map((s) => s.content).join('\n');
	if (!/@[\w:._-]/.test(allContent)) return '';

	const bib = opts.refs
		.map((ref) => {
			const fields: string[] = [];
			const authors = (ref.authors ?? [])
				.map((a) => [a.last, a.first].filter(Boolean).join(', '))
				.join(' and ');
			if (authors) fields.push(`  author      = {${authors}}`);
			fields.push(`  title        = {${ref.title}}`);
			if (ref.year)        fields.push(`  year         = {${ref.year}}`);
			if (ref.journal)     fields.push(`  journal      = {${ref.journal}}`);
			if (ref.volume)      fields.push(`  volume       = {${ref.volume}}`);
			if (ref.issue)       fields.push(`  number       = {${ref.issue}}`);
			if (ref.pages)       fields.push(`  pages        = {${ref.pages}}`);
			if (ref.publisher)   fields.push(`  publisher    = {${ref.publisher}}`);
			if (ref.booktitle)   fields.push(`  booktitle    = {${ref.booktitle}}`);
			if (ref.school)      fields.push(`  school       = {${ref.school}}`);
			if (ref.doi)         fields.push(`  doi          = {${ref.doi}}`);
			if (ref.url)         fields.push(`  url          = {${ref.url}}`);
			return `@${ref.type}{${ref.citeKey},\n${fields.join(',\n')}\n}`;
		})
		.join('\n\n');

	const escaped = bib.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
	return `\n\n#bibliography(bytes("${escaped}"), format: "bibtex")\n`;
}

function escapeTypstString(s: string): string {
	return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}
