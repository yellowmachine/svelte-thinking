<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import { marked } from 'marked';
	import markedFootnote from 'marked-footnote';
	import DOMPurify from 'dompurify';
	import katex from 'katex';

	marked.use(markedFootnote());
	import { trpc } from '$lib/utils/trpc';
	import { processCitations, type CitationStyle, type CiteRef } from '$lib/utils/citations';
	import { processWikilinks, processPersonsAndIndex, stripFrontmatter } from '$lib/utils/wikilinks';
	import { extractEpigraphsForProcessing, restoreEpigraphs } from '$lib/utils/epigraphs';
	import { extractCallouts, restoreCallouts } from '$lib/utils/callouts';
	import { einkStore } from '$lib/stores/eink.svelte';
	import { untrack } from 'svelte';

	let {
		content = '',
		preRenderedHtml = undefined as string | undefined,
		projectId = null,
		references = [],
		citationStyle = 'apa',
		docMap = new Map(),
		commentAnchors = [] as { id: string; anchorText: string }[],
		paragraphComments = [] as { id: string; paragraphNumber: number }[],
		oncommentclick = undefined as ((id: string) => void) | undefined,
		onselection = undefined as
			| ((sel: {
					text: string;
					coords: { top: number; bottom: number; left: number; right: number };
			  }) => void)
			| undefined,
		onparagraphcomment = undefined as
			| ((paragraphNumber: number, coords: { top: number; right: number }) => void)
			| undefined
	}: {
		content: string;
		preRenderedHtml?: string;
		projectId?: string | null;
		references?: CiteRef[];
		citationStyle?: CitationStyle;
		docMap?: Map<string, { id: string; projectId: string }>;
		commentAnchors?: { id: string; anchorText: string }[];
		paragraphComments?: { id: string; paragraphNumber: number }[];
		oncommentclick?: (id: string) => void;
		onselection?: (sel: {
			text: string;
			coords: { top: number; bottom: number; left: number; right: number };
		}) => void;
		onparagraphcomment?: (paragraphNumber: number, coords: { top: number; right: number }) => void;
	} = $props();

	// Build a key → ref map for fast lookup in the citation processor
	const refsMap = $derived(new Map(references.map((r) => [r.citeKey, r])));

	// E-ink: freeze snapshot until manual refresh
	let snapshot = $state(untrack(() => content));

	$effect(() => {
		if (einkStore.enabled) return;
		const next = content;
		const timer = setTimeout(() => {
			snapshot = next;
		}, 400);
		return () => clearTimeout(timer);
	});

	function refresh() {
		snapshot = content;
	}

	let container: HTMLDivElement | null = null;

	// ── KaTeX renderer ────────────────────────────────────────────────────────
	// We pre-process math before marked so it doesn't interfere with markdown
	// escaping. Placeholders are used to protect rendered HTML from marked.

	function renderMath(src: string): { processed: string; mathBlocks: SvelteMap<string, string> } {
		const mathBlocks = new SvelteMap<string, string>();
		let idx = 0;

		// Display math: $$...$$
		let out = src.replace(/\$\$([\s\S]+?)\$\$/g, (_match, tex) => {
			const id = `math-block-${idx++}`;
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

		// Inline math: $...$  (not preceded/followed by another $)
		out = out.replace(/(?<!\$)\$(?!\$)((?:[^$\n])+?)\$(?!\$)/g, (_match, tex) => {
			const id = `math-inline-${idx++}`;
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

		return { processed: out, mathBlocks };
	}

	function restoreMath(html: string, mathBlocks: Map<string, string>): string {
		return html.replace(/<!--math:(math-(?:block|inline)-\d+)-->/g, (_match, id) => {
			return mathBlocks.get(id) ?? '';
		});
	}

	// ── Mermaid extractor ────────────────────────────────────────────────────

	function extractDiagrams(src: string): {
		processed: string;
		diagrams: SvelteMap<string, string>;
	} {
		const diagrams = new SvelteMap<string, string>();
		let idx = 0;

		const processed = src.replace(/^```mermaid\n([\s\S]*?)^```/gm, (_match, code) => {
			const id = `mermaid-diagram-${idx++}`;
			diagrams.set(id, code.trim());
			return `<div data-mermaid-id="${id}"></div>`;
		});

		return { processed, diagrams };
	}

	async function renderDiagrams(diagrams: Map<string, string>) {
		if (!container || diagrams.size === 0) return;

		const { default: mermaid } = await import('mermaid');
		mermaid.initialize({
			startOnLoad: false,
			theme: 'neutral',
			fontFamily: '"Source Serif 4", Georgia, serif'
		});

		for (const [id, code] of diagrams) {
			const el = container.querySelector(`[data-mermaid-id="${id}"]`);
			if (!el) continue;
			try {
				const { svg } = await mermaid.render(`mermaid-svg-${id}`, code);
				el.innerHTML = svg;
			} catch (e) {
				el.textContent = `Mermaid error: ${e}`;
			}
		}
	}

	// ── Vega-lite extractor ───────────────────────────────────────────────────

	function extractPlots(src: string): { processed: string; plots: SvelteMap<string, object> } {
		const plots = new SvelteMap<string, object>();
		let idx = 0;

		const processed = src.replace(/^```vega-lite\n([\s\S]*?)^```/gm, (_match, json) => {
			const id = `vega-plot-${idx++}`;
			try {
				plots.set(id, JSON.parse(json.trim()));
			} catch {
				plots.set(id, { error: 'Invalid JSON in vega-lite block' });
			}
			return `<div data-vega-id="${id}"></div>`;
		});

		return { processed, plots };
	}

	// ── Full parse pipeline ───────────────────────────────────────────────────

	function parseMarkdown(
		src: string,
		refs: Map<string, CiteRef>,
		style: CitationStyle,
		wikilinkMap: Map<string, { id: string; projectId: string }>
	): { html: string; plots: Map<string, object>; diagrams: Map<string, string> } {
		src = stripFrontmatter(src);
		const { processed: withDiagramPlaceholders, diagrams } = extractDiagrams(src);
		const { processed: withPlaceholders, plots } = extractPlots(withDiagramPlaceholders);
		const { processed: withCalloutPlaceholders, callouts } = extractCallouts(withPlaceholders);
		const { processed: withEpigraphPlaceholders, epigraphs } =
			extractEpigraphsForProcessing(withCalloutPlaceholders);
		const { processed: withMathPlaceholders, mathBlocks } = renderMath(withEpigraphPlaceholders);
		const withWikilinks =
			wikilinkMap.size > 0
				? processWikilinks(withMathPlaceholders, wikilinkMap)
				: withMathPlaceholders;
		const withPersons = processPersonsAndIndex(withWikilinks);
		const withCitations = refs.size > 0 ? processCitations(withPersons, refs, style) : withPersons;
		const rawHtml = marked.parse(withCitations) as string;
		const restored = restoreMath(rawHtml, mathBlocks);
		const withEpigraphs = restoreEpigraphs(restored, epigraphs);
		const withCallouts = restoreCallouts(withEpigraphs, callouts);
		const html =
			typeof DOMPurify.sanitize === 'function'
				? DOMPurify.sanitize(withCallouts, {
						ADD_TAGS: ['math', 'figure', 'figcaption'],
						ADD_ATTR: ['data-vega-id', 'data-mermaid-id', 'role']
					})
				: withCallouts;
		return { html, plots, diagrams };
	}

	// ── Dataset $ref resolution ───────────────────────────────────────────────

	async function resolveSpec(spec: Record<string, unknown>): Promise<Record<string, unknown>> {
		const data = spec.data as Record<string, unknown> | undefined;
		if (!data || typeof data.$ref !== 'string') return spec;

		const ref = data.$ref as string;
		if (!ref.startsWith('dataset:') || !projectId) return spec;

		const filename = ref.slice('dataset:'.length);
		try {
			const { url } = await trpc.datasets.resolveRef.query({ projectId, filename });
			return { ...spec, data: { url } };
		} catch {
			return { ...spec, data: { values: [], __error: `Dataset "${filename}" not found` } };
		}
	}

	// ── Vega-embed ────────────────────────────────────────────────────────────

	async function renderPlots(plots: Map<string, object>) {
		if (!container || plots.size === 0) return;

		const { default: embed } = await import('vega-embed');

		for (const [id, rawSpec] of plots) {
			const el = container.querySelector(`[data-vega-id="${id}"]`);
			if (!el) continue;

			if ('error' in (rawSpec as Record<string, unknown>)) {
				el.textContent = (rawSpec as { error: string }).error;
				(el as HTMLElement).style.color = 'red';
				continue;
			}

			const spec = await resolveSpec(rawSpec as Record<string, unknown>);

			try {
				await embed(el as HTMLElement, spec as never, {
					actions: false,
					theme: 'latimes',
					config: { background: 'transparent', font: '"Source Serif 4", Georgia, serif' }
				});
			} catch (e) {
				el.textContent = `Error rendering plot: ${e}`;
			}
		}
	}

	let parsed = $derived(
		preRenderedHtml !== undefined
			? {
					html: preRenderedHtml,
					plots: new Map<string, object>(),
					diagrams: new Map<string, string>()
				}
			: parseMarkdown(snapshot, refsMap, citationStyle, docMap)
	);

	$effect(() => {
		const { plots } = parsed;
		Promise.resolve().then(() => renderPlots(plots));
	});

	$effect(() => {
		const { diagrams } = parsed;
		Promise.resolve().then(() => renderDiagrams(diagrams));
	});

	// ── Comment anchor highlighting ───────────────────────────────────────────

	function findAndWrapText(root: HTMLElement, text: string, commentId: string): boolean {
		if (!text) return false;
		const isAnnotation = commentId.startsWith('ann-');
		const anchorClass = isAnnotation ? 'annotation-anchor' : 'comment-anchor';
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
		let node: Text | null;
		while ((node = walker.nextNode() as Text | null)) {
			const idx = node.nodeValue?.indexOf(text) ?? -1;
			if (idx === -1) continue;
			// Skip if already inside an anchor mark
			if ((node.parentElement as HTMLElement)?.closest?.('.comment-anchor, .annotation-anchor'))
				continue;
			const before = node.splitText(idx);
			const after = before.splitText(text.length);
			const mark = document.createElement('mark');
			mark.className = anchorClass;
			mark.dataset.commentId = commentId;
			mark.addEventListener('click', () => oncommentclick?.(commentId));
			before.parentNode!.insertBefore(mark, after);
			mark.appendChild(before);
			return true;
		}
		return false;
	}

	function applyCommentMarks(anchors: { id: string; anchorText: string }[]) {
		if (!container) return;
		// Remove existing marks
		container.querySelectorAll('mark.comment-anchor, mark.annotation-anchor').forEach((el) => {
			const parent = el.parentNode!;
			while (el.firstChild) parent.insertBefore(el.firstChild, el);
			parent.removeChild(el);
			parent.normalize();
		});
		for (const anchor of anchors) {
			findAndWrapText(container, anchor.anchorText, anchor.id);
		}
	}

	$effect(() => {
		// Re-apply marks whenever parsed HTML or anchors change — touch both to track reactivity
		void parsed.html;
		const anchors = commentAnchors;
		Promise.resolve().then(() => applyCommentMarks(anchors));
	});

	// ── Selection handler ─────────────────────────────────────────────────────

	// ── Paragraph markers ────────────────────────────────────────────────────

	function applyParagraphMarkers() {
		if (!container) return;
		// Remove existing markers
		container.querySelectorAll('.para-marker').forEach((el) => el.remove());
		if (!onparagraphcomment && paragraphComments.length === 0) return;

		const paragraphs = Array.from(container.querySelectorAll('p'));
		paragraphs.forEach((p, i) => {
			const n = i + 1;
			const existing = paragraphComments.filter((c) => c.paragraphNumber === n);

			const marker = document.createElement('button');
			marker.className = 'para-marker' + (existing.length > 0 ? ' para-marker--has-comments' : '');
			marker.setAttribute('type', 'button');
			marker.setAttribute('aria-label', `Comentar párrafo ${n}`);
			marker.dataset.paragraph = String(n);
			marker.textContent = existing.length > 0 ? `¶${n} · ${existing.length}` : `¶${n}`;
			marker.addEventListener('click', (e) => {
				e.stopPropagation();
				if (existing.length > 0) {
					oncommentclick?.(existing[0].id);
				} else {
					const rect = (p as HTMLElement).getBoundingClientRect();
					onparagraphcomment?.(n, { top: rect.top, right: rect.right });
				}
			});

			(p as HTMLElement).style.position = 'relative';
			p.appendChild(marker);
		});
	}

	$effect(() => {
		// Touch both reactive values to track changes
		void parsed.html;
		void paragraphComments;
		Promise.resolve().then(() => applyParagraphMarkers());
	});

	export function getParagraphText(n: number): string {
		if (!container) return '';
		const paragraphs = container.querySelectorAll('p');
		return paragraphs[n - 1]?.textContent?.trim() ?? '';
	}

	export function scrollToBlock(index: number) {
		if (!container) return;
		const blocks = Array.from(
			container.querySelectorAll(
				':scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > h4,' +
					' :scope > h5, :scope > h6, :scope > blockquote, :scope > pre,' +
					' :scope > ul, :scope > ol, :scope > table'
			)
		);
		const target = blocks[Math.min(index, blocks.length - 1)] as HTMLElement | undefined;
		if (!target) return;
		target.scrollIntoView({ behavior: 'smooth', block: 'center' });
		target.animate(
			[
				{ backgroundColor: 'rgb(253 224 71 / 0.45)' },
				{ backgroundColor: 'rgb(253 224 71 / 0.45)' },
				{ backgroundColor: 'rgb(253 224 71 / 0)' }
			],
			{ duration: 2000, easing: 'ease-out' }
		);
	}

	export function scrollToComment(commentId: string, paragraphNumber: number | null) {
		if (!container) return;
		let target: Element | null = null;

		if (paragraphNumber != null) {
			const paragraphs = container.querySelectorAll('p');
			target = paragraphs[paragraphNumber - 1] ?? null;
		} else {
			const isAnnotation = commentId.startsWith('ann-');
			const anchorClass = isAnnotation ? 'annotation-anchor' : 'comment-anchor';
			target = container.querySelector(`mark.${anchorClass}[data-comment-id="${commentId}"]`);
		}

		if (!target) return;
		target.scrollIntoView({ behavior: 'instant', block: 'center' });
		const highlightClass = commentId.startsWith('ann-')
			? 'annotation-highlight'
			: 'comment-highlight';
		(target as HTMLElement).classList.add(highlightClass);
		setTimeout(() => (target as HTMLElement).classList.remove(highlightClass), 1800);
	}

	function handleMouseUp() {
		if (!onselection) return;
		const sel = window.getSelection();
		if (!sel || sel.isCollapsed || !sel.toString().trim()) return;
		if (!container?.contains(sel.anchorNode)) return;
		const text = sel.toString().trim();
		const range = sel.getRangeAt(0);
		const rect = range.getBoundingClientRect();
		onselection({
			text,
			coords: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }
		});
	}
</script>

<svelte:head>
	<link
		rel="stylesheet"
		href="https://cdn.jsdelivr.net/npm/katex@0.16.39/dist/katex.min.css"
		crossorigin="anonymous"
	/>
</svelte:head>

<div class="relative">
	{#if einkStore.enabled}
		<button
			type="button"
			onclick={refresh}
			title="Refresh preview"
			class="absolute top-0 right-0 z-10 rounded border border-ink/20 bg-paper px-2 py-0.5 font-sans text-xs text-ink-muted hover:bg-paper-ui hover:text-ink"
		>
			↻ Refresh
		</button>
	{/if}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		bind:this={container}
		translate="no"
		class="prose-serif prose max-w-none dark:prose-invert"
		style="overflow: visible;"
		onmouseup={handleMouseUp}
	>
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html parsed.html}
	</div>
</div>

<style>
	.prose :global(img) {
		max-width: 100%;
		max-height: 600px;
		height: auto;
		border-radius: 0.375rem;
		display: block;
		margin: 1rem auto;
	}

	.prose :global([data-vega-id]) {
		margin: 1.5rem 0;
	}

	.prose :global(.vega-embed) {
		background: transparent !important;
	}

	.prose :global(.vega-embed canvas),
	.prose :global(.vega-embed svg) {
		max-width: 100%;
		height: auto;
	}

	/* Display math: centered block */
	.prose :global(.katex-display) {
		margin: 1.5rem 0;
		overflow-x: auto;
		overflow-y: hidden;
	}

	.prose :global(.math-error) {
		color: red;
		font-family: monospace;
		font-size: 0.875em;
	}

	.prose :global(.wikilink-unresolved) {
		color: var(--color-ink-faint, #a89880);
		font-style: italic;
		cursor: help;
	}

	.prose :global(.mention-person) {
		border-bottom: 1px dotted var(--color-ink-faint, #a89880);
	}

	.prose :global(.persons-index) {
		margin-top: 2rem;
		padding-top: 1rem;
		border-top: 1px solid var(--color-paper-border, #e8e2da);
	}

	.prose :global(.persons-index ol) {
		padding-left: 1.25rem;
		columns: 2;
		gap: 1rem;
	}

	.prose :global(.persons-index li) {
		margin-bottom: 0.25rem;
		font-size: 0.875em;
		break-inside: avoid;
	}

	.prose :global(.persons-index a) {
		color: var(--color-ink-muted, #57534e);
		text-decoration: none;
	}

	.prose :global(.persons-index a:hover) {
		color: var(--color-ink, #1c1917);
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	/* Notas al pie */
	.prose :global(.footnotes) {
		margin-top: 3rem;
		padding-top: 1rem;
		border-top: 1px solid var(--color-paper-border, #e8e2da);
		font-size: 0.875em;
		color: var(--color-ink-muted, #57534e);
	}

	.prose :global(.footnotes ol) {
		padding-left: 1.25rem;
	}

	.prose :global(.footnotes li) {
		margin-bottom: 0.25rem;
	}

	.prose :global(a[data-footnote-ref]) {
		font-size: 0.75em;
		vertical-align: super;
		line-height: 0;
		text-decoration: none;
		color: var(--color-accent, #7c5c3e);
		font-weight: 600;
	}

	.prose :global(a[data-footnote-backref]) {
		text-decoration: none;
		color: var(--color-ink-faint, #a8a29e);
		margin-left: 0.25rem;
	}

	.prose :global(a[data-footnote-backref]:hover) {
		color: var(--color-accent, #7c5c3e);
	}

	/* Epigraphs */
	.prose :global(.epigraph-block) {
		margin: 2rem 0;
		padding: 1.5rem;
		border-left: 4px solid var(--color-accent, #7c5c3e);
		background: var(--color-paper-ui, #ede8df);
		font-style: italic;
	}

	.prose :global(.epigraph-block blockquote) {
		margin: 0;
		padding: 0;
	}

	.prose :global(.epigraph-block blockquote p) {
		margin: 0 0 0.5rem 0;
	}

	.prose :global(.epigraph-block figcaption) {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.9rem;
		font-style: normal;
		color: var(--color-ink-muted, #7a6a58);
	}

	.prose :global(.epigraph-author) {
		font-weight: 500;
	}

	.prose :global(.epigraph-source) {
		font-size: 0.85rem;
	}

	/* Paragraph markers */
	.prose :global(.para-marker) {
		position: absolute;
		right: 0.25rem;
		top: 0.2em;
		font-family: var(--font-sans, sans-serif);
		font-size: 0.65rem;
		color: var(--color-ink-faint, #a8a29e);
		background: var(--color-paper-ui, #ede8df);
		border: none;
		cursor: pointer;
		padding: 0.1em 0.35em;
		border-radius: 3px;
		opacity: 0;
		transition:
			opacity 0.15s,
			color 0.15s;
		white-space: nowrap;
		line-height: 1.4;
	}

	.prose :global(p:hover > .para-marker),
	.prose :global(.para-marker--has-comments) {
		opacity: 1;
	}

	.prose :global(.para-marker--has-comments) {
		color: var(--color-accent, #7c5c3e);
		font-weight: 600;
	}

	.prose :global(.para-marker:hover) {
		color: var(--color-accent, #7c5c3e);
		background: var(--color-paper-ui, #ede8df);
	}

	/* Comment anchors */
	.prose :global(mark.comment-anchor) {
		background-color: oklch(0.92 0.08 85 / 0.55);
		border-bottom: 2px solid oklch(0.75 0.12 75);
		border-radius: 2px;
		cursor: pointer;
		padding: 0 1px;
	}

	.prose :global(mark.comment-anchor:hover) {
		background-color: oklch(0.88 0.11 75 / 0.7);
	}

	@keyframes comment-highlight-fade {
		0% {
			background-color: oklch(0.92 0.12 85 / 0.55);
		}
		100% {
			background-color: transparent;
		}
	}

	/* Applied to <mark> when clicked from sidebar */
	.prose :global(mark.comment-highlight) {
		animation: comment-highlight-fade 1.8s ease-out forwards;
	}

	/* Annotation anchors — teal, distinct from yellow comment anchors */
	.prose :global(mark.annotation-anchor) {
		background-color: oklch(0.92 0.06 195 / 0.45);
		border-bottom: 2px solid oklch(0.65 0.12 195);
		border-radius: 2px;
		cursor: pointer;
		padding: 0 1px;
	}

	.prose :global(mark.annotation-anchor:hover) {
		background-color: oklch(0.88 0.09 195 / 0.6);
	}

	@keyframes annotation-highlight-fade {
		0% {
			background-color: oklch(0.85 0.12 195 / 0.6);
		}
		100% {
			background-color: transparent;
		}
	}

	.prose :global(mark.annotation-highlight) {
		animation: annotation-highlight-fade 1.8s ease-out forwards;
	}

	/* Applied to <p> for paragraph comments */
	.prose :global(p.comment-highlight) {
		animation: comment-highlight-fade 1.8s ease-out forwards;
		border-radius: 3px;
	}

	/* Callout blocks */
	.prose :global(.callout) {
		margin: 1.5rem 0;
		padding: 0.875rem 1rem;
		border-radius: 0.375rem;
		border-left-width: 3px;
		border-left-style: solid;
		font-family: var(--font-sans, sans-serif);
		font-size: 0.9em;
	}

	.prose :global(.callout-header) {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-weight: 600;
		margin-bottom: 0.35rem;
	}

	.prose :global(.callout-body) {
		color: var(--color-ink-muted, #57534e);
		line-height: 1.6;
		white-space: pre-wrap;
	}

	/* note — blue/neutral */
	.prose :global(.callout-note) {
		background: oklch(0.96 0.02 240 / 0.6);
		border-left-color: oklch(0.6 0.1 240);
		color: oklch(0.35 0.08 240);
	}
	.prose :global(.callout-note .callout-header) {
		color: oklch(0.45 0.1 240);
	}

	/* warning — amber */
	.prose :global(.callout-warning) {
		background: oklch(0.97 0.05 80 / 0.6);
		border-left-color: oklch(0.72 0.14 70);
		color: oklch(0.4 0.08 70);
	}
	.prose :global(.callout-warning .callout-header) {
		color: oklch(0.5 0.14 70);
	}

	/* tip — green */
	.prose :global(.callout-tip) {
		background: oklch(0.96 0.04 150 / 0.6);
		border-left-color: oklch(0.58 0.12 150);
		color: oklch(0.35 0.08 150);
	}
	.prose :global(.callout-tip .callout-header) {
		color: oklch(0.45 0.12 150);
	}

	/* caution — red/orange */
	.prose :global(.callout-caution) {
		background: oklch(0.97 0.04 25 / 0.6);
		border-left-color: oklch(0.6 0.15 25);
		color: oklch(0.38 0.08 25);
	}
	.prose :global(.callout-caution .callout-header) {
		color: oklch(0.48 0.15 25);
	}

	/* Dark mode adjustments */
	:global(.dark) .prose :global(.callout-note) {
		background: oklch(0.25 0.04 240 / 0.5);
	}
	:global(.dark) .prose :global(.callout-warning) {
		background: oklch(0.25 0.05 70 / 0.5);
	}
	:global(.dark) .prose :global(.callout-tip) {
		background: oklch(0.25 0.04 150 / 0.5);
	}
	:global(.dark) .prose :global(.callout-caution) {
		background: oklch(0.25 0.05 25 / 0.5);
	}
</style>
