<script lang="ts">
	import type { CiteRef } from '$lib/utils/citations';

	import { resolve } from '$app/paths';
	let {
		refs,
		refsLoaded,
		projectId,
		onclose,
		oninsert
	}: {
		refs: CiteRef[];
		refsLoaded: boolean;
		projectId: string;
		onclose: () => void;
		oninsert: (ref: CiteRef) => void;
	} = $props();

	let citeSearch = $state('');

	const filteredRefs = $derived.by(() => {
		const q = citeSearch.toLowerCase();
		if (!q) return refs;
		return refs.filter(
			(r) =>
				r.citeKey.toLowerCase().includes(q) ||
				r.title.toLowerCase().includes(q) ||
				r.authors.some((a) => a.last.toLowerCase().includes(q))
		);
	});
</script>

<div
	class="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm sm:items-center"
	role="presentation"
	onclick={(e) => {
		if (e.target === e.currentTarget) onclose();
	}}
>
	<div
		class="w-full max-w-sm rounded-t-2xl border border-paper-border bg-paper shadow-2xl sm:rounded-2xl dark:border-dark-paper-border dark:bg-dark-paper"
		role="dialog"
		aria-modal="true"
		aria-labelledby="cite-picker-title"
	>
		<div
			class="flex items-center justify-between border-b border-paper-border px-5 py-3.5 dark:border-dark-paper-border"
		>
			<h2
				id="cite-picker-title"
				class="font-serif text-base font-semibold text-ink dark:text-dark-ink"
			>
				Insertar cita
			</h2>
			<button
				onclick={onclose}
				aria-label="Cerrar"
				class="rounded-md p-1 text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
			>
				<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
					<path
						d="M1 1l12 12M13 1L1 13"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
					/>
				</svg>
			</button>
		</div>

		<div class="px-4 pt-3">
			<input
				type="search"
				bind:value={citeSearch}
				placeholder="Search by author, title or key…"
				class="w-full rounded-lg border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
			/>
		</div>

		<div class="max-h-72 overflow-y-auto px-2 py-2">
			{#if !refsLoaded}
				<p class="px-3 py-4 text-center font-sans text-sm text-ink-faint dark:text-dark-ink-faint">
					Cargando…
				</p>
			{:else if refs.length === 0}
				<div class="px-3 py-6 text-center">
					<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
						Sin referencias en este proyecto.
					</p>
					<a
						href={resolve(`/projects/${projectId}/bib`)}
						class="mt-1 block font-sans text-xs text-accent hover:underline"
					>
						Go to Bibliography →
					</a>
				</div>
			{:else if filteredRefs.length === 0}
				<p class="px-3 py-4 text-center font-sans text-sm text-ink-faint dark:text-dark-ink-faint">
					Sin resultados.
				</p>
			{:else}
				{#each filteredRefs as ref (ref.citeKey)}
					<button
						onclick={() => oninsert(ref)}
						class="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-paper-ui dark:hover:bg-dark-paper-ui"
					>
						<span
							class="mt-0.5 shrink-0 rounded-md border border-accent/30 bg-accent/5 px-1.5 py-0.5 font-mono text-xs text-accent"
						>
							{ref.citeKey}
						</span>
						<span class="min-w-0">
							<span class="block truncate font-sans text-sm text-ink dark:text-dark-ink"
								>{ref.title}</span
							>
							<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
								{ref.authors[0]?.last ?? ''}{ref.authors.length > 1 ? ' et al.' : ''}{ref.year
									? ' · ' + ref.year
									: ''}
							</span>
						</span>
					</button>
				{/each}
			{/if}
		</div>
	</div>
</div>
