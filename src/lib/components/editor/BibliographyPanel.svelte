<script lang="ts">
	import type { CiteRef } from '$lib/utils/citations';

	let {
		refs,
		activeKey = null,
		filter = $bindable(''),
		onscrolltocite,
		oninsert
	}: {
		refs: CiteRef[];
		activeKey?: string | null;
		filter?: string;
		onscrolltocite?: (citeKey: string) => void;
		oninsert?: (citeKey: string) => void;
	} = $props();

	const filtered = $derived.by(() => {
		const q = filter.toLowerCase();
		if (!q) return refs;
		return refs.filter(
			(r) =>
				r.citeKey.toLowerCase().includes(q) ||
				r.title.toLowerCase().includes(q) ||
				r.authors.some((a) => a.last.toLowerCase().includes(q))
		);
	});

	$effect(() => {
		const key = activeKey;
		if (!key) return;
		Promise.resolve().then(() => {
			document
				.querySelector(`[data-bib-ref="${CSS.escape(key)}"]`)
				?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		});
	});
</script>

<div class="flex w-80 shrink-0 flex-col overflow-hidden border-l border-paper-border bg-paper">
	<div class="flex items-center justify-between border-b border-paper-border px-4 py-3">
		<h3 class="font-serif text-sm font-semibold text-ink">Bibliography</h3>
		<span class="font-sans text-xs text-ink-faint">{refs.length} refs</span>
	</div>

	<div class="border-b border-paper-border px-3 py-2">
		<input
			type="text"
			bind:value={filter}
			placeholder="Filter… e.g. dennett"
			class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
		/>
	</div>

	<div class="flex-1 space-y-1 overflow-y-auto p-2">
		{#if refs.length === 0}
			<p class="px-1 py-6 text-center font-sans text-sm text-ink-muted">
				No references in this project.
			</p>
		{:else if filtered.length === 0}
			<p class="px-1 py-6 text-center font-sans text-sm text-ink-muted">No matches.</p>
		{:else}
			{#each filtered as ref (ref.id ?? ref.citeKey)}
				<div
					data-bib-ref={ref.citeKey}
					class="rounded-lg border p-2.5 transition-colors {activeKey === ref.citeKey
						? 'border-accent/50 bg-accent/5 dark:border-accent/40 dark:bg-accent/10'
						: 'border-paper-border bg-paper'}"
				>
					<div class="flex items-center justify-between gap-1">
						<button
							onclick={() => onscrolltocite?.(ref.citeKey)}
							class="font-mono text-xs font-semibold text-accent-ink hover:underline"
						>
							@{ref.citeKey}
						</button>
						<button
							onclick={() => oninsert?.(ref.citeKey)}
							title="Insert citation at cursor"
							class="rounded px-1.5 py-0.5 font-sans text-[10px] text-ink-faint transition-colors hover:bg-accent hover:text-white"
						>
							+ cite
						</button>
					</div>
					<p class="mt-0.5 line-clamp-2 font-sans text-xs leading-snug text-ink">
						{ref.title}
					</p>
					{#if ref.authors.length > 0}
						<p class="mt-0.5 font-sans text-[10px] text-ink-faint">
							{ref.authors.map((a) => a.last).join(', ')}{ref.year ? ` (${ref.year})` : ''}
						</p>
					{/if}
					{#if ref.subnotes && ref.subnotes.length > 0}
						<div class="mt-2 space-y-1.5 border-t border-paper-border pt-2">
							{#each ref.subnotes as s (s.slug)}
								<div class="border-l-2 border-accent/30 pl-2">
									<span class="font-mono text-[10px] font-semibold text-accent-ink">:{s.slug}</span>
									{#if s.notes}
										<p
											class="mt-0.5 font-sans text-[10px] leading-snug whitespace-pre-wrap text-ink-muted"
										>
											{s.notes}
										</p>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		{/if}
	</div>
</div>
