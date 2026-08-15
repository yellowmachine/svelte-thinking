<script lang="ts">
	import { renderMermaidToSvg } from '$lib/utils/mermaidRender';

	let { code = '' }: { code?: string } = $props();

	let container: HTMLDivElement | null = null;
	let error = $state<string | null>(null);

	// Debounce: avoid re-rendering on every keystroke while the user is typing.
	let renderTimer: ReturnType<typeof setTimeout> | null = null;

	async function render(src: string) {
		// Mermaid renders into a nested, non-Svelte-managed target rather than
		// the bind:this container itself, so we don't fight Svelte's own DOM
		// bookkeeping for that element (svelte/no-dom-manipulating).
		const target = container?.querySelector<HTMLElement>('[data-mermaid-target]');
		if (!target) return;
		const trimmed = src.trim();
		if (!trimmed) {
			error = null;
			target.innerHTML = '';
			return;
		}
		try {
			const svg = await renderMermaidToSvg(trimmed);
			// The source may have changed while we were awaiting the render.
			target.innerHTML = svg;
			error = null;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	$effect(() => {
		const src = code;
		if (renderTimer) clearTimeout(renderTimer);
		renderTimer = setTimeout(() => render(src), 300);
		return () => {
			if (renderTimer) clearTimeout(renderTimer);
		};
	});
</script>

<div class="flex h-full flex-col items-center justify-center overflow-auto p-6">
	<div bind:this={container} class="mermaid-preview-container max-w-full">
		<div data-mermaid-target></div>
	</div>
	{#if error}
		<div
			class="mt-3 max-w-md rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-mono text-xs whitespace-pre-wrap text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300"
		>
			{error}
		</div>
	{/if}
</div>

<style>
	.mermaid-preview-container :global(svg) {
		max-width: 100%;
		height: auto;
	}
</style>
