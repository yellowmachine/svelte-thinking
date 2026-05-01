<script lang="ts">
	import { base } from '$app/paths';
	import type { ProposedReference } from '$lib/server/trpc/routers/ai';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	type Props = {
		references: ProposedReference[];
		projectId: string;
		onconfirm: (count: number) => void;
		ondiscard: () => void;
	};

	let { references, projectId, onconfirm, ondiscard }: Props = $props();

	let selected = $state<boolean[]>(references.map(() => true));
	let status: 'idle' | 'loading' | 'done' | 'discarded' = $state('idle');
	let addedCount = $state(0);

	const selectedCount = $derived(selected.filter(Boolean).length);

	function formatAuthors(authors: { first: string; last: string }[]) {
		return authors.map((a) => [a.last, a.first].filter(Boolean).join(', ')).join('; ');
	}

	const typeLabel: Record<string, string> = {
		article: 'Article',
		book: 'Book',
		inproceedings: 'Conference paper',
		incollection: 'Book chapter',
		phdthesis: 'PhD thesis',
		mastersthesis: "Master's thesis",
		techreport: 'Technical report',
		misc: 'Other'
	};

	async function confirm() {
		if (status !== 'idle' || selectedCount === 0) return;
		status = 'loading';
		try {
			const { trpc } = await import('$lib/utils/trpc');
			const toAdd = references.filter((_, i) => selected[i]);
			const result = await trpc.ai.applyAction.mutate({
				projectId,
				action: {
					type: 'add_references',
					references: toAdd.map((r) => ({
						citeKey: r.citeKey,
						type: r.type,
						title: r.title,
						authors: r.authors,
						year: r.year,
						journal: r.journal,
						publisher: r.publisher,
						doi: r.doi,
						url: r.url,
						volume: r.volume,
						issue: r.issue,
						pages: r.pages,
						abstract: r.abstract
					}))
				}
			});
			addedCount = result.type === 'references' ? result.count : 0;
			status = 'done';
			onconfirm(addedCount);
		} catch {
			status = 'idle';
		}
	}

	function discard() {
		status = 'discarded';
		ondiscard();
	}
</script>

{#if status !== 'discarded'}
	<div
		class="mt-2 overflow-hidden rounded-xl border transition-colors
		{status === 'done'
			? 'border-green-200 bg-green-50 dark:border-green-900/40 dark:bg-green-950/20'
			: 'border-accent/20 bg-accent/5 dark:border-accent/15 dark:bg-accent/5'}"
	>
		<!-- Header -->
		<div class="flex items-center gap-3 px-4 pt-4 pb-2">
			<div
				class="shrink-0 rounded-lg p-2
				{status === 'done'
					? 'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400'
					: 'bg-accent/10 text-accent'}"
			>
				{#if status === 'done'}
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path
							d="M20 6L9 17l-5-5"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				{:else}
					<!-- Book icon -->
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path
							d="M4 19.5A2.5 2.5 0 016.5 17H20"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
						<path
							d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				{/if}
			</div>
			<div class="min-w-0 flex-1">
				<p
					class="font-sans text-[11px] font-semibold tracking-wide uppercase
					{status === 'done' ? 'text-green-600 dark:text-green-400' : 'text-accent'}"
				>
					{#if status === 'done'}
						{addedCount} {addedCount === 1 ? 'reference' : 'references'} added
					{:else}
						Add to bibliography
					{/if}
				</p>
				{#if status !== 'done'}
					<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
						{references.length}
						{references.length === 1 ? 'reference' : 'references'} proposed — select the ones to add
					</p>
				{/if}
			</div>
		</div>

		{#if status !== 'done'}
			<!-- Reference list -->
			<ul class="mx-4 mb-3 flex flex-col gap-1.5">
				{#each references as ref, i}
					<li>
						<label
							class="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-accent/5 dark:hover:bg-accent/8"
						>
							<input
								type="checkbox"
								bind:checked={selected[i]}
								disabled={status === 'loading'}
								class="mt-0.5 shrink-0 accent-accent"
							/>
							<div class="min-w-0">
								<p class="font-sans text-xs leading-snug font-medium text-ink dark:text-dark-ink">
									{ref.title}
								</p>
								<p class="mt-0.5 font-sans text-[11px] text-ink-faint dark:text-dark-ink-faint">
									{#if ref.authors.length > 0}{formatAuthors(ref.authors)}{/if}{#if ref.year}
										· {ref.year}{/if}
									{#if ref.type}
										· <span class="italic">{typeLabel[ref.type] ?? ref.type}</span>{/if}
									{#if ref.journal}
										· {ref.journal}{/if}
									{#if ref.publisher}
										· {ref.publisher}{/if}
								</p>
							</div>
						</label>
					</li>
				{/each}
			</ul>
		{/if}

		<!-- Actions -->
		<div class="flex justify-end gap-2 px-4 pt-1 pb-3">
			{#if status === 'done'}
				<a
					href="{base}/projects/{projectId}/bib"
					class="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 font-sans text-xs font-medium text-white transition-opacity hover:opacity-90"
				>
					Open bibliography
					<svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path
							d="M5 12h14M12 5l7 7-7 7"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</a>
			{:else}
				<button
					onclick={discard}
					disabled={status === 'loading'}
					class="rounded-lg px-3 py-1.5 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-border disabled:opacity-40 dark:text-dark-ink-muted dark:hover:bg-dark-paper-border"
				>
					Discard
				</button>
				<button
					onclick={confirm}
					disabled={status === 'loading' || selectedCount === 0}
					class="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 font-sans text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
				>
					{#if status === 'loading'}
						<Spinner size="sm" />
						Adding…
					{:else}
						<svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path
								d="M20 6L9 17l-5-5"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
						Add {selectedCount > 0 ? `${selectedCount} ` : ''}{selectedCount === 1
							? 'reference'
							: 'references'}
					{/if}
				</button>
			{/if}
		</div>
	</div>
{/if}
