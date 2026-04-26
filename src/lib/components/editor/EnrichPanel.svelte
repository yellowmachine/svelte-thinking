<script lang="ts">
	import { trpc } from '$lib/utils/trpc';

	type UntaggedRef = { context: string; text: string; citeKey: string };
	type UntaggedResult = { persons: string[]; refs: UntaggedRef[] };

	let {
		projectId,
		documentId,
		content,
		onclose,
		onapplyperson,
		oapplyref
	}: {
		projectId: string;
		documentId: string;
		content: string;
		onclose: () => void;
		onapplyperson: (name: string) => void;
		oapplyref: (context: string, text: string, citeKey: string) => void;
	} = $props();

	let loadingEnrich = $state(false);
	let enrichResult = $state<UntaggedResult | null>(null);
	let enrichError = $state('');

	const NO_KEY_MSG = 'No AI key configured. Go to Settings → AI to add one.';

	function isNoKeyError(e: unknown): boolean {
		return !!(
			e &&
			typeof e === 'object' &&
			'data' in e &&
			(e as { data?: { code?: string } }).data?.code === 'PRECONDITION_FAILED'
		);
	}

	async function runEnrich() {
		if (loadingEnrich) return;
		loadingEnrich = true;
		enrichError = '';
		enrichResult = null;
		try {
			enrichResult = await trpc.ai.findUntagged.mutate({ projectId, documentId });
		} catch (e: unknown) {
			enrichError = isNoKeyError(e)
				? NO_KEY_MSG
				: e instanceof Error
					? e.message
					: 'Error analysing document.';
		} finally {
			loadingEnrich = false;
		}
	}

	function enrichSnippet(term: string): { before: string; match: string; after: string } | null {
		const idx = content.indexOf(term);
		if (idx === -1) return null;
		const start = Math.max(0, idx - 50);
		const end = Math.min(content.length, idx + term.length + 50);
		return {
			before: (start > 0 ? '…' : '') + content.slice(start, idx),
			match: term,
			after: content.slice(idx + term.length, end) + (end < content.length ? '…' : '')
		};
	}

	function applyPerson(name: string) {
		onapplyperson(name);
		if (enrichResult) {
			enrichResult = { ...enrichResult, persons: enrichResult.persons.filter((p) => p !== name) };
		}
	}

	function applyRef(ref: UntaggedRef) {
		oapplyref(ref.context, ref.text, ref.citeKey);
		if (enrichResult) {
			enrichResult = {
				...enrichResult,
				refs: enrichResult.refs.filter((r) => r.text !== ref.text)
			};
		}
	}

	function applyAll() {
		if (!enrichResult) return;
		enrichResult.persons.forEach((name) => onapplyperson(name));
		enrichResult.refs.forEach((r) => oapplyref(r.context, r.text, r.citeKey));
		enrichResult = { persons: [], refs: [] };
	}
</script>

<div
	class="flex w-80 shrink-0 flex-col overflow-hidden border-l border-paper-border bg-paper dark:border-dark-paper-border dark:bg-dark-paper"
>
	<div
		class="flex items-center justify-between border-b border-paper-border px-4 py-3 dark:border-dark-paper-border"
	>
		<h3 class="font-serif text-sm font-semibold text-ink dark:text-dark-ink">Enrich document</h3>
		<button
			type="button"
			onclick={onclose}
			class="text-ink-faint transition-colors hover:text-ink-muted dark:text-dark-ink-faint dark:hover:text-dark-ink-muted"
			aria-label="Close"
		>
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path
					d="M18 6L6 18M6 6l12 12"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
				/>
			</svg>
		</button>
	</div>

	<div class="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
		{#if !enrichResult && !loadingEnrich}
			<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
				Finds person names not yet tagged as <code
					class="rounded bg-paper-ui px-1 font-mono text-[11px] dark:bg-dark-paper-ui"
					>[[person:]]</code
				> and informal citations that match a reference in your bibliography.
			</p>
			<button
				type="button"
				onclick={runEnrich}
				class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
			>
				Analyse document
			</button>
		{:else if loadingEnrich}
			<p class="py-6 text-center font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				Analysing…
			</p>
		{:else if enrichError}
			<p class="font-sans text-xs text-red-500">{enrichError}</p>
		{:else if enrichResult}
			{#if enrichResult.persons.length === 0 && enrichResult.refs.length === 0}
				<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
					No untagged persons or informal citations found.
				</p>
			{:else}
				<button
					type="button"
					onclick={applyAll}
					class="rounded-md border border-accent/40 bg-accent/5 px-3 py-1.5 font-sans text-xs text-accent transition-colors hover:bg-accent/10"
				>
					Apply all
				</button>
			{/if}

			{#if enrichResult.persons.length > 0}
				<div>
					<p
						class="mb-2 font-sans text-[11px] font-medium tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint"
					>
						People
					</p>
					<div class="flex flex-col gap-1.5">
						{#each enrichResult.persons as name (name)}
							{@const snippet = enrichSnippet(name)}
							<div
								class="flex items-start justify-between rounded-md border border-paper-border bg-paper-ui px-3 py-2 dark:border-dark-paper-border dark:bg-dark-paper-ui"
							>
								<div class="min-w-0">
									{#if snippet}
										<p
											class="font-sans text-[11px] leading-relaxed text-ink-muted dark:text-dark-ink-muted"
										>
											{snippet.before}<strong class="text-ink dark:text-dark-ink"
												>{snippet.match}</strong
											>{snippet.after}
										</p>
									{/if}
									<span
										class="mt-0.5 block font-mono text-[10px] text-ink-faint dark:text-dark-ink-faint"
										>→ [[person:{name}]]</span
									>
								</div>
								<button
									type="button"
									onclick={() => applyPerson(name)}
									class="ml-2 shrink-0 font-sans text-[10px] text-accent hover:underline"
									>Apply</button
								>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			{#if enrichResult.refs.length > 0}
				<div>
					<p
						class="mb-2 font-sans text-[11px] font-medium tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint"
					>
						Informal citations
					</p>
					<div class="flex flex-col gap-1.5">
						{#each enrichResult.refs as ref (ref.text)}
							{@const refTextIdx = ref.context.indexOf(ref.text)}
							{@const refSnippet =
								refTextIdx !== -1
									? {
											before: ref.context.slice(0, refTextIdx),
											match: ref.text,
											after: ref.context.slice(refTextIdx + ref.text.length)
										}
									: enrichSnippet(ref.text)}
							<div
								class="flex items-start justify-between rounded-md border border-paper-border bg-paper-ui px-3 py-2 dark:border-dark-paper-border dark:bg-dark-paper-ui"
							>
								<div class="min-w-0">
									{#if refSnippet}
										<p
											class="font-sans text-[11px] leading-relaxed text-ink-muted dark:text-dark-ink-muted"
										>
											{refSnippet.before}<strong class="text-ink dark:text-dark-ink"
												>{refSnippet.match}</strong
											>{refSnippet.after}
										</p>
									{/if}
									<span
										class="mt-0.5 block font-mono text-[10px] text-ink-faint dark:text-dark-ink-faint"
										>→ [[@{ref.citeKey}]]</span
									>
								</div>
								<button
									type="button"
									onclick={() => applyRef(ref)}
									class="ml-2 shrink-0 font-sans text-[10px] text-accent hover:underline"
									>Apply</button
								>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<button
				type="button"
				onclick={runEnrich}
				disabled={loadingEnrich}
				class="mt-auto rounded-md border border-paper-border px-3 py-1.5 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-ui disabled:opacity-40 dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
			>
				Re-analyse
			</button>
		{/if}
	</div>
</div>
