<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { trpc } from '$lib/utils/trpc';
	import { renderMermaidToSvg } from '$lib/utils/mermaidRender';

	let {
		docs,
		onclose,
		oninsert
	}: {
		docs: { id: string; title: string }[];
		onclose: () => void;
		oninsert: (token: string) => void;
	} = $props();

	let diagramSearch = $state('');
	let selected = $state<{ id: string; title: string } | null>(null);
	let previewSvg = $state('');
	let previewError = $state('');
	let previewLoading = $state(false);

	const filteredDocs = $derived.by(() => {
		const q = diagramSearch.toLowerCase().trim();
		if (!q) return docs;
		return docs.filter((d) => d.title.toLowerCase().includes(q));
	});

	async function select(doc: { id: string; title: string }) {
		selected = doc;
		previewSvg = '';
		previewError = '';
		previewLoading = true;
		try {
			const withContent = await trpc.documents.withContent.query(doc.id);
			previewSvg = await renderMermaidToSvg(withContent.content);
		} catch (e) {
			previewError = `Couldn't preview the diagram: ${e}`;
		} finally {
			previewLoading = false;
		}
	}

	function confirmInsert() {
		if (!selected) return;
		oninsert(`[[diagram:${selected.id}|${selected.title}]]`);
	}
</script>

<div
	class="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm sm:items-center"
	role="presentation"
	onclick={(e) => {
		if (e.target === e.currentTarget) onclose();
	}}
>
	<div
		class="flex max-h-[80vh] w-full max-w-lg flex-col rounded-t-2xl border border-paper-border bg-paper shadow-2xl sm:rounded-2xl"
		role="dialog"
		aria-modal="true"
		aria-labelledby="diagram-insert-title"
	>
		<div class="flex items-center justify-between border-b border-paper-border px-5 py-3.5">
			<h2 id="diagram-insert-title" class="font-serif text-base font-semibold text-ink">
				Insert diagram
			</h2>
			<button
				onclick={onclose}
				aria-label="Close"
				class="rounded-md p-1 text-ink-muted hover:bg-paper-ui"
			>
				<X size={14} strokeWidth={1.75} aria-hidden="true" />
			</button>
		</div>

		<div class="px-4 pt-3">
			<input
				type="search"
				bind:value={diagramSearch}
				placeholder="Search by title…"
				class="w-full rounded-lg border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
			/>
		</div>

		<div class="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden px-4 py-3 sm:grid-cols-2">
			<div class="max-h-64 overflow-y-auto sm:max-h-none">
				{#if docs.length === 0}
					<p class="px-3 py-6 text-center font-sans text-sm text-ink-muted">
						No diagrams in this project.
					</p>
				{:else if filteredDocs.length === 0}
					<p class="px-3 py-4 text-center font-sans text-sm text-ink-faint">No results.</p>
				{:else}
					{#each filteredDocs as doc (doc.id)}
						<button
							onclick={() => select(doc)}
							class="block w-full truncate rounded-lg px-3 py-2 text-left font-sans text-sm transition-colors {selected?.id ===
							doc.id
								? 'bg-accent/10 text-accent-ink dark:bg-accent/20'
								: 'text-ink hover:bg-paper-ui'}"
						>
							{doc.title}
						</button>
					{/each}
				{/if}
			</div>

			<div
				class="flex min-h-40 flex-col items-center justify-center overflow-auto rounded-lg border border-paper-border bg-paper-ui p-3"
			>
				{#if !selected}
					<p class="font-sans text-sm text-ink-faint">Select a diagram to preview it</p>
				{:else}
					<p class="mb-2 self-start font-sans text-sm font-medium text-ink">
						{selected.title}
					</p>
					{#if previewLoading}
						<p class="font-sans text-sm text-ink-faint">Loading…</p>
					{:else if previewError}
						<p class="font-sans text-sm text-danger">{previewError}</p>
					{:else}
						<div class="w-full [&_svg]:h-auto [&_svg]:max-w-full">
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							{@html previewSvg}
						</div>
					{/if}
				{/if}
			</div>
		</div>

		<div class="flex justify-end gap-2 border-t border-paper-border px-4 py-3">
			<button
				onclick={onclose}
				class="rounded-md px-3 py-1.5 font-sans text-sm text-ink-muted hover:bg-paper-ui"
			>
				Cancel
			</button>
			<button
				onclick={confirmInsert}
				disabled={!selected}
				class="rounded-md bg-accent px-3 py-1.5 font-sans text-sm text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
			>
				Insert
			</button>
		</div>
	</div>
</div>
