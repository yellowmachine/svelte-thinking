<script lang="ts">
	import { marked, type RendererObject } from 'marked';
	import katex from 'katex';
	import { trpc } from '$lib/utils/trpc';
	import { processCitations, type CitationStyle, type CiteRef } from '$lib/utils/citations';
	import { processWikilinks } from '$lib/utils/wikilinks';

	let {
		content = '',
		projectId = null,
		references = [],
		citationStyle = 'apa',
		docMap = new Map()
	}: {
		content: string;
		projectId?: string | null;
		references?: CiteRef[];
		citationStyle?: CitationStyle;
		docMap?: Map<string, { id: string; projectId: string }>;
	} = $props();

	// Build a key → ref map for fast lookup in the citation processor
	const refsMap = $derived(new Map(references.map((r) => [r.citeKey, r])));

	let container: HTMLDivElement | null = null;

	// ── KaTeX renderer ────────────────────────────────────────────────────────
	// We pre-process math before marked so it doesn't interfere with markdown
	// escaping. Placeholders are used to protect rendered HTML from marked.

	function renderMath(src: string): { processed: string; mathBlocks: Map<string, string> } {
		const mathBlocks = new Map<string, string>();
		let idx = 0;

		// Display math: $$...$$
		let out = src.replace(/\$\$([\s\S]+?)\$\$/g, (_match, tex) => {
			const id = `math-block-${idx++}`;
			try {
				mathBlocks.set(id, katex.renderToString(tex.trim(), { displayMode: true, throwOnError: false }));
			} catch {
				mathBlocks.set(id, `<span class="math-error">LaTeX error</span>`);
			}
			return `<!--math:${id}-->`;
		});

		// Inline math: $...$  (not preceded/followed by another $)
		out = out.replace(/(?<!\$)\$(?!\$)((?:[^$\n])+?)\$(?!\$)/g, (_match, tex) => {
			const id = `math-inline-${idx++}`;
			try {
				mathBlocks.set(id, katex.renderToString(tex.trim(), { displayMode: false, throwOnError: false }));
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

	// ── Vega-lite extractor ───────────────────────────────────────────────────

	function extractPlots(src: string): { processed: string; plots: Map<string, object> } {
		const plots = new Map<string, object>();
		let idx = 0;

		const processed = src.replace(/^```vega-lite\n([\s\S]*?)^```/gm, (_match, json) => {
			const id = `vega-plot-${idx++}`;
			try {
				plots.set(id, JSON.parse(json.trim()));
			} catch {
				plots.set(id, { error: 'JSON inválido en bloque vega-lite' });
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
	): { html: string; plots: Map<string, object> } {
		const { processed: withPlaceholders, plots } = extractPlots(src);
		const { processed: withMathPlaceholders, mathBlocks } = renderMath(withPlaceholders);
		const withWikilinks = wikilinkMap.size > 0 ? processWikilinks(withMathPlaceholders, wikilinkMap) : withMathPlaceholders;
		const withCitations = refs.size > 0 ? processCitations(withWikilinks, refs, style) : withWikilinks;
		const rawHtml = marked.parse(withCitations) as string;
		const html = restoreMath(rawHtml, mathBlocks);
		return { html, plots };
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
			return { ...spec, data: { values: [], __error: `Dataset "${filename}" no encontrado` } };
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
				el.textContent = `Error al renderizar gráfico: ${e}`;
			}
		}
	}

	let parsed = $derived(parseMarkdown(content, refsMap, citationStyle, docMap));

	$effect(() => {
		const { plots } = parsed;
		Promise.resolve().then(() => renderPlots(plots));
	});
</script>

<svelte:head>
	<link
		rel="stylesheet"
		href="https://cdn.jsdelivr.net/npm/katex@0.16.39/dist/katex.min.css"
		crossorigin="anonymous"
	/>
</svelte:head>

<div bind:this={container} class="prose prose-serif max-w-none dark:prose-invert">
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html parsed.html}
</div>

<style>
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
		color: var(--color-ink-faint, #A89880);
		font-style: italic;
		cursor: help;
	}
</style>
