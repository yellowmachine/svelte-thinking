import { env } from '$env/dynamic/private';
import type { RefData } from '$lib/utils/export';

const TYPST_URL = env.TYPST_SERVICE_URL ?? 'http://localhost:3100';

export interface TypstSection {
	title: string;
	content: string; // already converted to Typst markup
}

export interface TypstDocumentOptions {
	title: string;
	description?: string | null;
	date?: string;
	sections: TypstSection[];
	refs?: RefData[]; // project bibliography — embedded as BibTeX if any @citations present
}

/** Builds a Typst source document from structured sections. */
export function buildTypstSource(opts: TypstDocumentOptions): string {
	const date = opts.date ?? new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });

	const sectionsTypst = opts.sections
		.map((s) => `== ${s.title}\n\n${s.content.trim()}`)
		.join('\n\n#v(1em)\n\n');

	return `\
#set document(title: "${escapeTypstString(opts.title)}")
#set page(
  margin: (x: 2.5cm, y: 3cm),
  numbering: "1",
  number-align: center,
)
#set text(font: "Linux Libertine", size: 11pt, lang: "es")
#set heading(numbering: "1.")
#set par(justify: true, leading: 0.75em, spacing: 1.2em)
#show heading.where(level: 1): it => {
  set text(size: 14pt, weight: "bold")
  v(1.5em, weak: true)
  it
  v(0.5em, weak: true)
}
#show heading.where(level: 2): it => {
  set text(size: 12pt, weight: "bold")
  v(1.2em, weak: true)
  it
  v(0.4em, weak: true)
}

// ── Title block ────────────────────────────────────────────────────────────
#align(center)[
  #v(2cm)
  #text(size: 20pt, weight: "bold")[${escapeTypstString(opts.title)}]
  ${opts.description ? `\n  #v(0.6em)\n  #text(size: 12pt, fill: luma(80))[${escapeTypstString(opts.description)}]` : ''}
  #v(0.4em)
  #text(size: 10pt, fill: luma(120))[${date}]
  #v(1cm)
  #line(length: 60%, stroke: luma(180))
  #v(2cm)
]

// ── Content ────────────────────────────────────────────────────────────────
${sectionsTypst}
${bibSection(opts)}`;

}

/** Sends the Typst source to the compile service and returns the PDF buffer. */
export async function compileToPdf(typstSource: string): Promise<Uint8Array> {
	const res = await fetch(`${TYPST_URL}/compile`, {
		method: 'POST',
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
		body: typstSource
	});

	if (!res.ok) {
		const msg = await res.text().catch(() => `HTTP ${res.status}`);
		throw new Error(`Typst compile error: ${msg}`);
	}

	const arrayBuffer = await res.arrayBuffer();
	return new Uint8Array(arrayBuffer);
}

function escapeTypstString(s: string): string {
	return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

/** Serializes refs as BibTeX and embeds them inline if any @citations exist in the content. */
function bibSection(opts: TypstDocumentOptions): string {
	if (!opts.refs?.length) return '';

	const allContent = opts.sections.map((s) => s.content).join('\n');
	if (!/@[\w:._-]/.test(allContent)) return '';

	const bib = opts.refs
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
			if (ref.doi) fields.push(`  doi       = {${ref.doi}}`);
			if (ref.url) fields.push(`  url       = {${ref.url}}`);
			return `@${ref.type}{${ref.citeKey},\n${fields.join(',\n')}\n}`;
		})
		.join('\n\n');

	// Escape for Typst bytes("...") string literal
	const escaped = bib.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');

	return `\n\n#bibliography(bytes("${escaped}"), format: "bibtex")\n`;
}
