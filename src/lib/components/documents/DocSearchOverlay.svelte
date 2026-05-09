<script lang="ts">
	import { tick } from 'svelte';
	import { trpc } from '$lib/utils/trpc';

	let {
		documentId,
		onclose
	}: {
		documentId: string;
		onclose: () => void;
	} = $props();

	let query = $state('');
	let results = $state<{ text: string; chunk_index: number; similarity: number }[]>([]);
	let loading = $state(false);
	let error = $state('');

	async function search() {
		const q = query.trim();
		if (!q) return;
		loading = true;
		error = '';
		try {
			results = await trpc.documents.searchInDocument.query({ documentId, query: q });
		} catch {
			error = 'Search failed.';
		} finally {
			loading = false;
		}
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onclose();
		} else if (e.key === 'Enter') {
			search();
		}
	}

	function norm(s: string) {
		return s.replace(/\s+/g, ' ').trim().toLowerCase();
	}

	function findMatch(root: Element, selector: string, needle: string): HTMLElement | null {
		const blocks = root.querySelectorAll(selector);
		for (const len of [50, 30, 15]) {
			const prefix = norm(needle.slice(0, len));
			if (!prefix) continue;
			for (const block of blocks) {
				if (norm(block.textContent ?? '').includes(prefix)) return block as HTMLElement;
			}
		}
		return null;
	}

	function scrollTo(el: HTMLElement) {
		// Walk ancestors to find the actual scrollable container rather than relying
		// on scrollIntoView, which can mis-target in nested flex layouts.
		let node: HTMLElement | null = el.parentElement;
		while (node) {
			const s = window.getComputedStyle(node);
			if (
				(s.overflowY === 'auto' || s.overflowY === 'scroll') &&
				node.scrollHeight > node.clientHeight
			) {
				const er = el.getBoundingClientRect();
				const nr = node.getBoundingClientRect();
				node.scrollTo({
					top: node.scrollTop + er.top - nr.top - nr.height / 2 + er.height / 2,
					behavior: 'smooth'
				});
				return;
			}
			node = node.parentElement;
		}
		el.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}

	function flash(el: HTMLElement) {
		el.animate(
			[
				{ backgroundColor: 'rgb(253 224 71 / 0.45)' },
				{ backgroundColor: 'rgb(253 224 71 / 0.45)' },
				{ backgroundColor: 'rgb(253 224 71 / 0)' }
			],
			{ duration: 2000, easing: 'ease-out' }
		);
	}

	function scrollToChunk(text: string) {
		const needle = text.trim().toLowerCase();

		// Preview / split mode: content is rendered inside .prose
		const prose = document.querySelector('.prose');
		console.debug('[search] prose found:', !!prose);
		if (prose) {
			const blocks = prose.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, td');
			console.debug('[search] blocks found:', blocks.length);
			console.debug('[search] needle (norm 50):', norm(needle.slice(0, 50)));
			if (blocks.length > 0)
				console.debug(
					'[search] first block (norm):',
					norm(blocks[0].textContent ?? '').slice(0, 80)
				);
			const el = findMatch(prose, 'p, h1, h2, h3, h4, h5, h6, li, blockquote, td', needle);
			console.debug(
				'[search] match found:',
				!!el,
				el?.tagName,
				norm(el?.textContent ?? '').slice(0, 60)
			);
			if (el) {
				scrollTo(el);
				flash(el);
				return;
			}
		}

		// Editor mode: CodeMirror renders each line as .cm-line inside .cm-content.
		// The cm-scroller has overflow:visible so the parent overflow-y-auto div scrolls.
		const cmContent = document.querySelector('.cm-content');
		console.debug('[search] cmContent found:', !!cmContent);
		if (cmContent) {
			const el = findMatch(cmContent, '.cm-line', needle);
			console.debug('[search] cm match found:', !!el);
			if (el) {
				scrollTo(el);
				return;
			}
		}
	}
</script>

<!-- backdrop -->
<div
	class="fixed inset-0 z-50"
	role="presentation"
	onpointerdown={(e) => {
		if (e.target === e.currentTarget) onclose();
	}}
>
	<!-- overlay panel -->
	<div
		class="absolute top-16 left-1/2 w-full max-w-xl -translate-x-1/2 rounded-xl border border-paper-border bg-paper shadow-2xl dark:border-dark-paper-border dark:bg-dark-paper"
	>
		<!-- search input -->
		<div
			class="flex items-center gap-2 border-b border-paper-border px-4 py-3 dark:border-dark-paper-border"
		>
			<svg
				class="h-4 w-4 shrink-0 text-ink-faint dark:text-dark-ink-faint"
				viewBox="0 0 20 20"
				fill="currentColor"
			>
				<path
					fill-rule="evenodd"
					d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
					clip-rule="evenodd"
				/>
			</svg>
			<input
				{@attach (node) => {
					node.focus();
				}}
				bind:value={query}
				{onkeydown}
				type="text"
				placeholder="Semantic search in this document…"
				class="min-w-0 flex-1 bg-transparent font-sans text-sm text-ink placeholder:text-ink-faint focus:outline-none dark:text-dark-ink dark:placeholder:text-dark-ink-faint"
			/>
			{#if loading}
				<span class="shrink-0 font-sans text-xs text-ink-faint dark:text-dark-ink-faint"
					>Searching…</span
				>
			{:else}
				<kbd
					class="shrink-0 rounded border border-paper-border px-1.5 py-0.5 font-sans text-[10px] text-ink-faint dark:border-dark-paper-border dark:text-dark-ink-faint"
					>↵</kbd
				>
			{/if}
		</div>

		<!-- results -->
		{#if error}
			<p class="px-4 py-3 font-sans text-sm text-red-500">{error}</p>
		{:else if results.length > 0}
			<ul class="max-h-80 overflow-y-auto py-1">
				{#each results as result (result.chunk_index)}
					<li>
						<button
							type="button"
							onclick={async () => {
								const text = result.text;
								onclose();
								await tick();
								requestAnimationFrame(() => scrollToChunk(text));
							}}
							class="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-paper-ui dark:hover:bg-dark-paper-ui"
						>
							<span
								class="mt-0.5 shrink-0 rounded bg-accent/10 px-1.5 py-0.5 font-sans text-[10px] font-medium text-accent"
							>
								{Math.round(result.similarity * 100)}%
							</span>
							<p class="line-clamp-2 font-sans text-sm text-ink dark:text-dark-ink">
								{result.text}
							</p>
						</button>
					</li>
				{/each}
			</ul>
		{:else if query.trim() && !loading}
			<p class="px-4 py-3 font-sans text-sm text-ink-faint dark:text-dark-ink-faint">
				No results found.
			</p>
		{/if}
	</div>
</div>
