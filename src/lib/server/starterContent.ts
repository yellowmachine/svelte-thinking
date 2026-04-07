/**
 * Starter documents automatically created when a user creates their first project.
 * Both texts are AI-generated and include an explicit disclaimer.
 */

export type StarterReference = {
	citeKey: string;
	type:
		| 'article'
		| 'book'
		| 'inproceedings'
		| 'incollection'
		| 'phdthesis'
		| 'mastersthesis'
		| 'techreport'
		| 'misc';
	title: string;
	authors: { first: string; last: string }[];
	year?: string;
	journal?: string;
	volume?: string;
	pages?: string;
	doi?: string;
	publisher?: string;
	address?: string;
	isbn?: string;
};

export type StarterDocument = {
	title: string;
	type: 'notes';
	content: string;
	references: StarterReference[];
};

// ── References ──────────────────────────────────────────────────────────────

const medicalReferences: StarterReference[] = [
	{
		citeKey: 'cryan2019',
		type: 'article',
		title: 'The Microbiota-Gut-Brain Axis',
		authors: [
			{ first: 'John F.', last: 'Cryan' },
			{ first: "Kenneth J.", last: "O'Riordan" },
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

const philosophyReferences: StarterReference[] = [
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

// ── Document content ─────────────────────────────────────────────────────────

const MEDICAL_CONTENT = `> ⚠️ *AI-generated sample document — created to help you explore this platform. Feel free to modify or delete it.*

# The Microbiota–Gut–Brain Axis: Reading Notes

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

---

*This document demonstrates citation linking (\`[[@key]]\`), footnotes (\`[[footnote: text]]\`), and heading structure in Scholio.*
`;

const PHILOSOPHY_CONTENT = `> ⚠️ *AI-generated sample document — created to help you explore this platform. Feel free to modify or delete it.*

> [!epigraph]
> "Darwin's idea bears an unmistakable likeness to universal acid: it eats through just about every traditional concept, and leaves in its wake a revolutionized world-view."
> — Daniel C. Dennett
> *Darwin's Dangerous Idea* (1995)

# Darwin's Dangerous Idea — Chapter 2: An Idea Whose Time Has Come

Daniel Dennett's *Darwin's Dangerous Idea* [[@dennett1995]] opens its first section by examining how the theory of evolution by natural selection was not merely a discovery but a conceptual revolution whose preconditions had been quietly accumulating for centuries.

## The Pre-Darwinian Landscape

Before Darwin and Wallace independently converged on natural selection in 1858, the intellectual climate had already undergone crucial transformations:

- **Deep time**: Lyell's uniformitarian geology had expanded the perceived age of Earth from thousands to hundreds of millions of years — providing the temporal canvas natural selection requires
- **Population thinking**: Malthus's essay on population introduced the idea of competitive pressure as a generative force
- **Comparative anatomy**: Cuvier and Owen had systematized morphological comparison in ways that implicitly pointed toward common descent

Dennett argues that natural selection was not waiting to be *discovered* but to be *recognized* — the conceptual tools were assembled; what remained was the act of synthesis [[@dennett1995]].

## The Library of Mendel

One of Dennett's central metaphors is the **Library of Mendel**: an imaginary space containing every possible genome — every finite string of base pairs that could, in principle, exist. [[footnote: Dennett borrows and extends Borges's Library of Babel, replacing textual strings with genetic sequences — a move that connects evolutionary theory to information theory.]]

Real organisms occupy a vanishingly small region of this library. Evolution is the process of exploring that space through random variation and differential reproduction — a blind, undirected search that nonetheless produces functional complexity.

This reframing dissolves what Dennett calls the *skyhook* intuition: the feeling that complex design requires a designing mind. Natural selection is instead a **crane** — a process that builds complexity from the ground up, using only resources already present at lower levels.

## The Dangerous Idea

What makes Darwin's idea *dangerous* is its universality. Dennett insists it is not merely a biological theory but an *algorithmic* process applicable wherever three conditions hold:

1. **Variation** — entities differ from one another
2. **Heredity** — differences are transmitted to offspring
3. **Differential fitness** — some variants reproduce more successfully

Wherever these three conditions obtain, natural selection will operate — on genes, on memes, on cultural practices, on neural circuits. This is the "universal acid" that Dennett develops in Chapter 3: a solvent that cannot be contained to biology [[@dennett1995]].

## Critical Responses

Dennett's universalism attracted sustained criticism from biologists like Stephen Jay Gould, who argued that natural selection is one among several evolutionary mechanisms and that Dennett systematically underweights contingency, constraint, and developmental channeling. [[footnote: The Dennett–Gould debate ran across multiple publications in the 1990s; a useful entry point is Gould's review in *The New York Review of Books* (June 1997).]]

---

*This document demonstrates epigraphs (\`> [!epigraph]\`), citations (\`[[@key]]\`), and footnotes (\`[[footnote: text]]\`) in Scholio.*
`;

// ── Exports ──────────────────────────────────────────────────────────────────

export const STARTER_DOCUMENTS: StarterDocument[] = [
	{
		title: 'The Microbiota–Gut–Brain Axis: Reading Notes',
		type: 'notes',
		content: MEDICAL_CONTENT,
		references: medicalReferences
	},
	{
		title: "Darwin's Dangerous Idea — Chapter 2 Notes",
		type: 'notes',
		content: PHILOSOPHY_CONTENT,
		references: philosophyReferences
	}
];
