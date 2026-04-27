/**
 * Sample documents for help pages and "Try it" project generation.
 *
 * SINGLE SOURCE OF TRUTH:
 *   - /help/[slug]  reads this to render the help page
 *   - projects.createFromSample  reads this to seed a real project
 *
 * Ordering inside `docs` matters: earlier docs are created first.
 * Use {{DOC_n}} in content to reference the UUID of the n-th doc (0-indexed).
 * The book master should always be the last doc in its array so all chapter
 * UUIDs are known before it is written.
 */

import type { StarterReference } from './starterContent';
import type { DocumentType } from '$lib/domain/document';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SampleDoc = {
	/** Scholio document type */
	docType: DocumentType;
	title: string;
	/**
	 * Markdown content. May contain {{DOC_0}}, {{DOC_1}} etc. as UUID placeholders
	 * for cross-doc wikilinks; these are substituted at project creation time.
	 */
	content: string;
	references?: StarterReference[];
};

export type SampleEntry = {
	/** URL segment — /help/[slug] */
	slug: string;
	/** Label used in /help cards */
	label: string;
	/** One-line hook shown in the card on /help */
	tagline: string;
	/** Longer explanation shown at the top of the detail page */
	description: string;
	/** Feature bullets shown in the "What you can do" section */
	features: string[];
	/** Title of the generated project */
	projectTitle: string;
	/**
	 * Documents to create, in order.
	 * The first doc whose content is shown verbatim in the help page.
	 */
	docs: SampleDoc[];
};

// ---------------------------------------------------------------------------
// Notes sample
// ---------------------------------------------------------------------------

const notesReferences: StarterReference[] = [
	{
		citeKey: 'cryan2019',
		type: 'article',
		title: 'The Microbiota-Gut-Brain Axis',
		authors: [
			{ first: 'John F.', last: 'Cryan' },
			{ first: 'Kenneth J.', last: "O'Riordan" },
			{ first: 'Catherine S. M.', last: 'Cowan' }
		],
		year: '2019',
		journal: 'Physiological Reviews',
		volume: '99',
		pages: '1877–2013',
		doi: '10.1152/physrev.00018.2018'
	},
	{
		citeKey: 'dinan2013',
		type: 'article',
		title: 'Psychobiotics: a novel class of psychotropic',
		authors: [
			{ first: 'Timothy G.', last: 'Dinan' },
			{ first: 'Catherine', last: 'Stanton' },
			{ first: 'John F.', last: 'Cryan' }
		],
		year: '2013',
		journal: 'Biological Psychiatry',
		volume: '74',
		pages: '720–726',
		doi: '10.1016/j.biopsych.2013.05.001'
	}
];

const NOTES_CONTENT = `# The Microbiota–Gut–Brain Axis: Reading Notes

The discovery that the human gut hosts approximately 38 trillion microbial cells—rivaling the number of human cells in the body—has fundamentally reshaped our understanding of human physiology [[@cryan2019]]. What was once considered a peripheral digestive organ is now recognized as a sophisticated signaling hub with profound implications for neuroscience, psychiatry, and medicine.

## Key Communication Pathways

The gut and brain communicate through at least four parallel channels:

1. **The vagus nerve** — the primary neural highway carrying bidirectional signals between enteric and central nervous systems
2. **The hypothalamic–pituitary–adrenal (HPA) axis** — linking gut-derived signals to stress response modulation
3. **Immune signaling** — gut-resident immune cells produce cytokines that cross the blood–brain barrier
4. **Metabolite production** — short-chain fatty acids (SCFAs) and neurotransmitter precursors synthesized by gut bacteria

## Psychobiotics: A New Therapeutic Frontier

Dinan and colleagues proposed the term *psychobiotic* to describe live organisms that, when ingested in adequate amounts, confer a mental health benefit [[@dinan2013]]. This concept has since expanded to include prebiotics — dietary fibers that selectively nourish beneficial microbial populations.

> "We propose that certain gut bacteria, by virtue of their influence on the stress response, could have antidepressant or anxiolytic properties." [[footnote: Dinan et al., 2013, p. 720 — the original definition was restricted to live organisms; later work extended it to substrate-based interventions.]]

## Clinical Implications

Early-phase clinical trials have explored microbiome modulation in:

- Major depressive disorder (MDD)
- Irritable bowel syndrome (IBS) with comorbid anxiety
- Autism spectrum disorder (ASD)

The heterogeneity of gut microbiome composition across individuals remains the principal challenge for translating bench findings into clinical practice [[@cryan2019]].

## Open Questions

- What is the minimal microbial intervention capable of producing measurable central nervous system changes?
- Are microbiome signatures causally linked to psychiatric phenotypes, or merely correlated?
- How do antibiotic-induced dysbiosis events during early development contribute to long-term neurological risk?
`;

// ---------------------------------------------------------------------------
// Book sample (chapter + book master)
// ---------------------------------------------------------------------------

const bookReferences: StarterReference[] = [
	{
		citeKey: 'dennett1995',
		type: 'book',
		title: "Darwin's Dangerous Idea: Evolution and the Meanings of Life",
		authors: [{ first: 'Daniel C.', last: 'Dennett' }],
		year: '1995',
		publisher: 'Simon & Schuster',
		address: 'New York',
		isbn: '978-0-684-82471-0'
	}
];

// DOC_0 → chapter 1 (preface, unnumbered)
// DOC_1 → chapter 2 (numbered chapter)
// DOC_2 → book master (references both)

const BOOK_PREFACE_CONTENT = `*This preface was written as part of a sample project generated by Scholio.*

This collection of notes explores [[person:Daniel Dennett]]'s *Darwin's Dangerous Idea* [[@dennett1995]] — specifically the argument that natural selection is not merely a biological mechanism but a universal algorithmic process.

The chapters that follow examine the pre-Darwinian intellectual landscape, the Library of Mendel metaphor, and the critical reception of Dennett's universalism.
`;

const BOOK_CHAPTER_CONTENT = `# Darwin's Dangerous Idea — Chapter 2: An Idea Whose Time Has Come

[[person:Daniel Dennett]]'s *Darwin's Dangerous Idea* [[@dennett1995]] opens its first section by examining how the theory of evolution by natural selection was not merely a discovery but a conceptual revolution whose preconditions had been quietly accumulating for centuries.

## The Pre-Darwinian Landscape

Before [[person:Charles Darwin]] and [[person:Alfred Russel Wallace]] independently converged on natural selection in 1858, the intellectual climate had already undergone crucial transformations:

- **Deep time**: [[person:Charles Lyell]]'s uniformitarian geology had expanded the perceived age of Earth from thousands to hundreds of millions of years — providing the temporal canvas natural selection requires
- **Population thinking**: [[person:Thomas Malthus]]'s essay on population introduced the idea of competitive pressure as a generative force
- **Comparative anatomy**: [[person:Georges Cuvier]] and [[person:Richard Owen]] had systematized morphological comparison in ways that implicitly pointed toward common descent

Dennett argues that natural selection was not waiting to be *discovered* but to be *recognized* — the conceptual tools were assembled; what remained was the act of synthesis [[@dennett1995]].

## The Library of Mendel

One of Dennett's central metaphors is the **Library of Mendel**: an imaginary space containing every possible genome — every finite string of base pairs that could, in principle, exist. [[footnote: Dennett borrows and extends Borges's Library of Babel, replacing textual strings with genetic sequences — a move that connects evolutionary theory to information theory.]]

Real organisms occupy a vanishingly small region of this library. Evolution is the process of exploring that space through random variation and differential reproduction — a blind, undirected search that nonetheless produces functional complexity.

## The Dangerous Idea

What makes Darwin's idea *dangerous* is its universality. Dennett insists it is not merely a biological theory but an *algorithmic* process applicable wherever three conditions hold:

1. **Variation** — entities differ from one another
2. **Heredity** — differences are transmitted to offspring
3. **Differential fitness** — some variants reproduce more successfully

## Persons Index

[[index:persons]]
`;

// Book master content — {{DOC_0}} and {{DOC_1}} are substituted at creation time
const BOOK_MASTER_CONTENT = `---
subtitle: Notes on Dennett's Universal Acid
lang: en
---

> [!epigraph]
> "Darwin's idea bears an unmistakable likeness to universal acid: it eats through just about every traditional concept, and leaves in its wake a revolutionized world-view."
> — Daniel C. Dennett
> *Darwin's Dangerous Idea* (1995)

[[doc:{{DOC_0}}|Preface]]
[[doc:{{DOC_1}}|Chapter 1: An Idea Whose Time Has Come]]
`;

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const SAMPLE_DOCS: SampleEntry[] = [
	{
		slug: 'notes',
		label: 'Notes',
		tagline: 'Annotations, reading notes, and ideas in progress.',
		description:
			'Notes documents are the most flexible type in Scholio. Use them for reading annotations, research memos, draft ideas, or any text that does not yet belong to a formal structure. They support the full editor syntax: citations, footnotes, math, wikilinks, and charts.',
		features: [
			'Inline bibliographic citations with [[@citeKey]]',
			'Footnotes with [[footnote: text]]',
			'Cross-document wikilinks with [[Document title]]',
			'LaTeX math blocks with $$ … $$',
			'Vega-Lite interactive charts',
			'Person tags with [[person:Name]] and onomastic index'
		],
		projectTitle: 'Sample — Notes document',
		docs: [
			{
				docType: 'notes',
				title: 'The Microbiota–Gut–Brain Axis: Reading Notes',
				content: NOTES_CONTENT,
				references: notesReferences
			}
		]
	},
	{
		slug: 'book',
		label: 'Book',
		tagline: 'Multi-chapter document with cover page, TOC, and numbered chapters.',
		description:
			'A Book document is a manifest that assembles other documents into a structured whole — cover page, table of contents, numbered chapters, and unnumbered sections (prefaces, appendices). The book master controls the order; each chapter is a separate document you can edit independently. Export generates a single typeset PDF.',
		features: [
			'YAML frontmatter for subtitle, edition, and language',
			'Chapter links with [[doc:UUID|Title]]',
			'Numbered chapters (type: chapter) and unnumbered sections (any other type)',
			'Epigraph callout with > [!epigraph]',
			'Auto-generated table of contents on export',
			'Language-aware chapter labels (CHAPTER / CAPÍTULO / CHAPITRE…)'
		],
		projectTitle: 'Sample — Book document',
		docs: [
			{
				docType: 'supplementary', // unnumbered → preface
				title: 'Preface',
				content: BOOK_PREFACE_CONTENT,
				references: bookReferences
			},
			{
				docType: 'chapter',
				title: 'Chapter 1: An Idea Whose Time Has Come',
				content: BOOK_CHAPTER_CONTENT,
				references: bookReferences
			},
			{
				docType: 'book',
				title: "Darwin's Dangerous Idea — Sample Book",
				content: BOOK_MASTER_CONTENT,
				references: [] // refs are on the chapters
			}
		]
	}
];

export function getSampleBySlug(slug: string): SampleEntry | undefined {
	return SAMPLE_DOCS.find((s) => s.slug === slug);
}
