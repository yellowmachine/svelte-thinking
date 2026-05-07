<script lang="ts">
	import { trpc } from '$lib/utils/trpc';
	import { generateCiteKey } from '$lib/utils/bibtex';

	type SemanticResult = {
		paperId: string;
		title: string;
		year: number | null;
		venue: string;
		authors: { name: string }[];
		externalIds: { DOI?: string } | null;
		openAccessPdf: { url: string } | null;
	};

	let {
		projectId,
		onclose,
		onadd
	}: {
		projectId: string;
		onclose: () => void;
		onadd: (ref: unknown) => void;
	} = $props();

	let semanticQuery = $state('');
	let semanticResults = $state<SemanticResult[]>([]);
	let semanticLoading = $state(false);
	let semanticError = $state('');
	let semanticAdding = $state(new Set<string>());

	function parseSemanticAuthors(authors: { name: string }[]) {
		return authors.map((a) => {
			const parts = a.name.trim().split(/\s+/);
			const last = parts.pop() ?? '';
			const first = parts.join(' ');
			return { first, last };
		});
	}

	async function searchSemantic() {
		const q = semanticQuery.trim();
		if (!q) return;
		semanticLoading = true;
		semanticError = '';
		semanticResults = [];
		try {
			const params = new URLSearchParams({
				query: q,
				fields: 'title,year,venue,authors,externalIds,openAccessPdf',
				limit: '8'
			});
			const res = await fetch(`https://api.semanticscholar.org/graph/v1/paper/search?${params}`);
			if (!res.ok) throw new Error(`Error ${res.status}`);
			const json = await res.json();
			semanticResults = json.data ?? [];
		} catch {
			semanticError = 'Error connecting to Semantic Scholar. Please try again.';
		} finally {
			semanticLoading = false;
		}
	}

	async function addSemanticResult(result: SemanticResult) {
		semanticAdding = new Set([...semanticAdding, result.paperId]);
		try {
			const authors = parseSemanticAuthors(result.authors);
			const year = result.year ? String(result.year) : '';
			const citeKey = generateCiteKey(authors, year);
			const added = await trpc.references.create.mutate({
				projectId,
				reference: {
					citeKey,
					type: 'article',
					title: result.title,
					authors,
					year: year || undefined,
					journal: result.venue || undefined,
					doi: result.externalIds?.DOI || undefined,
					url: result.openAccessPdf?.url || undefined,
					extra: {}
				}
			});
			onadd(added);
		} finally {
			const next = new Set(semanticAdding);
			next.delete(result.paperId);
			semanticAdding = next;
		}
	}
</script>

<div
	class="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-20 backdrop-blur-sm"
	role="dialog"
	aria-modal="true"
	aria-labelledby="semantic-search-title"
>
	<div
		class="flex w-full max-w-2xl flex-col gap-4 rounded-2xl border border-paper-border bg-paper p-6 shadow-xl dark:border-dark-paper-border dark:bg-dark-paper"
	>
		<div class="flex items-center justify-between">
			<h2
				id="semantic-search-title"
				class="font-serif text-base font-semibold text-ink dark:text-dark-ink"
			>
				Search Semantic Scholar
			</h2>
			<button
				onclick={onclose}
				class="rounded p-1 text-ink-faint transition-colors hover:text-ink dark:text-dark-ink-faint dark:hover:text-dark-ink"
				aria-label="Close"
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M18 6 6 18M6 6l12 12"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
					/>
				</svg>
			</button>
		</div>

		<form
			onsubmit={(e) => {
				e.preventDefault();
				searchSemantic();
			}}
			class="flex gap-2"
		>
			<!-- svelte-ignore a11y_autofocus -->
			<input
				bind:value={semanticQuery}
				placeholder="Title, author or keywords…"
				class="flex-1 rounded-lg border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
				autofocus
			/>
			<button
				type="submit"
				disabled={semanticLoading || !semanticQuery.trim()}
				class="rounded-lg bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
			>
				{semanticLoading ? 'Searching…' : 'Search'}
			</button>
		</form>

		{#if semanticError}
			<p class="font-sans text-sm text-red-500">{semanticError}</p>
		{/if}

		{#if semanticResults.length > 0}
			<div class="flex flex-col gap-2 overflow-y-auto" style="max-height: 420px;">
				{#each semanticResults as result (result.paperId)}
					<div
						class="flex items-start gap-3 rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
					>
						<div class="min-w-0 flex-1">
							<p class="font-sans text-sm leading-snug font-medium text-ink dark:text-dark-ink">
								{result.title}
							</p>
							<p class="mt-1 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
								{result.authors
									.slice(0, 3)
									.map((a) => a.name)
									.join(', ')}{result.authors.length > 3 ? ' et al.' : ''}
								{#if result.year}
									· {result.year}{/if}
								{#if result.venue}
									· <span class="italic">{result.venue}</span>{/if}
							</p>
							{#if result.externalIds?.DOI}
								<p class="mt-0.5 font-mono text-xs text-ink-faint dark:text-dark-ink-faint">
									DOI: {result.externalIds.DOI}
								</p>
							{/if}
						</div>
						<button
							onclick={() => addSemanticResult(result)}
							disabled={semanticAdding.has(result.paperId)}
							class="shrink-0 rounded-lg border border-accent px-3 py-1.5 font-sans text-xs font-medium text-accent transition-colors hover:bg-accent hover:text-white disabled:opacity-50"
						>
							{semanticAdding.has(result.paperId) ? 'Adding…' : '+ Add'}
						</button>
					</div>
				{/each}
			</div>
		{:else if !semanticLoading && semanticQuery && !semanticError}
			<p class="py-4 text-center font-sans text-sm text-ink-faint dark:text-dark-ink-faint">
				No results. Try different terms.
			</p>
		{/if}
	</div>
</div>
