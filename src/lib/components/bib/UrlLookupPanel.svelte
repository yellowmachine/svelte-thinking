<script lang="ts">
	import { trpc } from '$lib/utils/trpc';

	type UrlResult = {
		citeKey: string;
		type: string;
		title: string;
		authors: { first: string; last: string }[];
		year: string | null;
		abstract: string | null;
		journal: string | null;
		volume: string | null;
		issue: string | null;
		pages: string | null;
		publisher: string | null;
		booktitle: string | null;
		school: string | null;
		institution: string | null;
		url: string;
	};

	let {
		projectId,
		hasAiKey,
		onclose,
		onaccept
	}: {
		projectId: string;
		hasAiKey: boolean;
		onclose: () => void;
		onaccept: (result: UrlResult, savePdf: boolean, importDocument: boolean) => Promise<void>;
	} = $props();

	let urlInput = $state('');
	let urlLoading = $state(false);
	let urlResult = $state<UrlResult | null>(null);
	let urlError = $state('');
	let urlSavePdf = $state(false);
	let urlImportDocument = $state(false);
	let urlImportingDoc = $state(false);

	async function runUrlLookup() {
		if (!urlInput.trim()) return;
		urlLoading = true;
		urlResult = null;
		urlError = '';
		try {
			urlResult = (await trpc.references.fetchUrl.query({
				url: urlInput.trim(),
				projectId
			})) as UrlResult;
		} catch (e) {
			urlError = e instanceof Error ? e.message : 'Could not extract metadata from URL.';
		} finally {
			urlLoading = false;
		}
	}

	async function handleAccept() {
		if (!urlResult) return;
		urlImportingDoc = urlImportDocument;
		try {
			await onaccept(urlResult, urlSavePdf, urlImportDocument);
			urlInput = '';
			urlResult = null;
			urlSavePdf = false;
			urlImportDocument = false;
		} catch (e) {
			urlError = e instanceof Error ? e.message : 'Could not save reference.';
		} finally {
			urlImportingDoc = false;
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
			<h2 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">URL → AI</h2>
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
			{#if !hasAiKey}
				<div class="flex flex-col gap-3 py-2">
					<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
						This feature requires an AI model. Configure your API key to extract metadata from URLs.
					</p>
					<a
						href="/settings#ai"
						class="self-start rounded-md bg-accent px-3 py-2 font-sans text-xs font-semibold text-white transition-colors hover:bg-accent-hover"
					>
						Go to Settings → AI Assistant
					</a>
				</div>
			{:else}
				<p class="font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					Paste the URL of a webpage. Your AI model will extract the bibliographic metadata. The
					page must be publicly accessible.
				</p>
				<div class="flex gap-2">
					<input
						type="url"
						bind:value={urlInput}
						placeholder="https://..."
						class="min-w-0 flex-1 rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
						onkeydown={(e) => e.key === 'Enter' && runUrlLookup()}
					/>
					<button
						onclick={runUrlLookup}
						disabled={urlLoading || !urlInput.trim()}
						class="rounded-md bg-accent px-3 py-2 font-sans text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
					>
						{urlLoading ? '…' : 'Extract'}
					</button>
				</div>

				{#if urlLoading}
					<p class="font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
						Fetching page and extracting metadata…
					</p>
				{/if}

				{#if urlError}
					<p
						class="rounded-lg bg-red-50 px-3 py-2 font-sans text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400"
					>
						{urlError}
					</p>
				{/if}

				{#if urlResult}
					<div
						class="space-y-1.5 rounded-lg border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
					>
						<p class="font-sans text-xs font-semibold text-ink dark:text-dark-ink">
							{urlResult.title}
						</p>
						{#if urlResult.authors.length}
							<p class="font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
								{urlResult.authors.map((a) => `${a.last}, ${a.first}`).join(' · ')}
							</p>
						{/if}
						<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
							{[urlResult.journal, urlResult.year].filter(Boolean).join(', ')}
						</p>
						<p class="font-mono text-[10px] text-accent">@{urlResult.citeKey}</p>
						<p class="truncate font-sans text-[10px] text-ink-faint dark:text-dark-ink-faint">
							{urlResult.url}
						</p>
					</div>
					<p class="font-sans text-[11px] text-ink-muted dark:text-dark-ink-muted">
						Review and edit the fields after adding if needed.
					</p>
					<label class="flex cursor-pointer items-center gap-2">
						<input
							type="checkbox"
							bind:checked={urlSavePdf}
							class="h-3.5 w-3.5 rounded accent-accent"
						/>
						<span class="font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
							Save a PDF snapshot
						</span>
					</label>
					<label class="flex cursor-pointer items-center gap-2">
						<input
							type="checkbox"
							bind:checked={urlImportDocument}
							class="h-3.5 w-3.5 rounded accent-accent"
						/>
						<span class="font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
							Import page as document
						</span>
					</label>
					<button
						onclick={handleAccept}
						disabled={urlImportingDoc}
						class="w-full rounded-md bg-accent px-3 py-2 font-sans text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
					>
						{urlImportingDoc ? 'Importing document…' : 'Add to bibliography'}
					</button>
				{/if}
			{/if}
		</div>
	</div>
</div>
