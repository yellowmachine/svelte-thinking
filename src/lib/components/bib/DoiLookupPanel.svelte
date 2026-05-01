<script lang="ts">
	import { trpc } from '$lib/utils/trpc';

	type DoiResult = {
		citeKey: string;
		type: string;
		title: string;
		authors: { first: string; last: string }[];
		year: string | null;
		journal: string | null;
		doi: string;
		abstract: string | null;
		url: string;
		volume: string | null;
		issue: string | null;
		pages: string | null;
		publisher: string | null;
		editors: { first: string; last: string }[];
	};

	let {
		onclose,
		onaccept
	}: {
		onclose: () => void;
		onaccept: (result: DoiResult) => Promise<void>;
	} = $props();

	let doiInput = $state('');
	let doiLoading = $state(false);
	let doiResult = $state<DoiResult | null>(null);
	let doiError = $state('');

	async function runDoiLookup() {
		if (!doiInput.trim()) return;
		doiLoading = true;
		doiResult = null;
		doiError = '';
		try {
			doiResult = (await trpc.references.fetchDoi.query(doiInput.trim())) as DoiResult;
		} catch (e) {
			doiError = e instanceof Error ? e.message : 'DOI not found.';
		} finally {
			doiLoading = false;
		}
	}

	async function handleAccept() {
		if (!doiResult) return;
		try {
			await onaccept(doiResult);
			doiInput = '';
			doiResult = null;
		} catch (e) {
			doiError = e instanceof Error ? e.message : 'Could not save reference.';
		}
	}
</script>

<div class="w-full max-w-sm shrink-0">
	<div
		class="sticky top-20 overflow-hidden rounded-2xl border border-paper-border bg-paper dark:border-dark-paper-border dark:bg-dark-paper"
	>
		<div
			class="flex items-center justify-between border-b border-paper-border px-5 py-3.5 dark:border-dark-paper-border"
		>
			<h2 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">DOI lookup</h2>
			<button
				onclick={onclose}
				aria-label="Close"
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

		<div class="space-y-4 px-5 py-4">
			<div class="flex gap-2">
				<input
					type="text"
					bind:value={doiInput}
					placeholder="10.1000/xyz123 or https://doi.org/..."
					class="min-w-0 flex-1 rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-mono text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
					onkeydown={(e) => e.key === 'Enter' && runDoiLookup()}
				/>
				<button
					onclick={runDoiLookup}
					disabled={doiLoading || !doiInput.trim()}
					class="rounded-md bg-accent px-3 py-2 font-sans text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
				>
					{doiLoading ? '…' : 'Fetch'}
				</button>
			</div>

			{#if doiError}
				<p
					class="rounded-lg bg-red-50 px-3 py-2 font-sans text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400"
				>
					{doiError}
				</p>
			{/if}

			{#if doiResult}
				<div
					class="space-y-1.5 rounded-lg border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
				>
					<p class="font-sans text-xs font-semibold text-ink dark:text-dark-ink">
						{doiResult.title}
					</p>
					{#if doiResult.authors.length}
						<p class="font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
							{doiResult.authors.map((a) => `${a.last}, ${a.first}`).join(' · ')}
						</p>
					{/if}
					<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
						{[doiResult.journal, doiResult.year].filter(Boolean).join(', ')}
						{#if doiResult.doi}<span class="ml-1 font-mono">DOI: {doiResult.doi}</span>{/if}
					</p>
					<p class="font-mono text-[10px] text-accent">@{doiResult.citeKey}</p>
				</div>
				<button
					onclick={handleAccept}
					class="w-full rounded-md bg-accent px-3 py-2 font-sans text-sm font-semibold text-white hover:bg-accent-hover"
				>
					Add to bibliography
				</button>
			{/if}
		</div>
	</div>
</div>
