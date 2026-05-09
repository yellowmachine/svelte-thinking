<script lang="ts">
	import { untrack } from 'svelte';
	import { trpc } from '$lib/utils/trpc';

	let {
		documentId,
		content,
		initialTab = 'text',
		onclose,
		onscrollto
	}: {
		documentId: string;
		content: string;
		initialTab?: 'text' | 'semantic';
		onclose: () => void;
		onscrollto: (blockIndex: number, searchText?: string) => void;
	} = $props();

	let activeTab = $state<'text' | 'semantic'>(untrack(() => initialTab));

	// ── Text search ───────────────────────────────────────────────────────────
	let textQuery = $state('');
	let currentMatch = $state(0);
	let listMode = $state(false);

	function normalize(s: string) {
		return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
	}

	const allParas = $derived(
		content
			.split(/\n\n+/)
			.map((s) => s.trim())
			.filter(Boolean)
	);

	const textMatches = $derived.by(() => {
		const q = normalize(textQuery.trim());
		if (!q) return [] as number[];
		return allParas.reduce<number[]>((acc, para, i) => {
			if (normalize(para).includes(q)) acc.push(i);
			return acc;
		}, []);
	});

	function onTextInput() {
		currentMatch = 0;
		const m = textMatches;
		if (m.length > 0) onscrollto(m[0], textQuery.trim());
	}

	function nextMatch() {
		if (!textMatches.length) return;
		const n = (currentMatch + 1) % textMatches.length;
		currentMatch = n;
		onscrollto(textMatches[n], textQuery.trim());
	}

	function prevMatch() {
		if (!textMatches.length) return;
		const p = (currentMatch - 1 + textMatches.length) % textMatches.length;
		currentMatch = p;
		onscrollto(textMatches[p], textQuery.trim());
	}

	function getSnippet(paraIndex: number): { before: string; match: string; after: string } {
		const para = allParas[paraIndex] ?? '';
		const q = textQuery.trim();
		if (!q) return { before: para.slice(0, 120), match: '', after: '' };
		const idx = para.toLowerCase().indexOf(q.toLowerCase());
		if (idx === -1) return { before: para.slice(0, 120), match: '', after: '' };
		const CTX = 65;
		const start = Math.max(0, idx - CTX);
		const end = Math.min(para.length, idx + q.length + CTX);
		return {
			before: (start > 0 ? '…' : '') + para.slice(start, idx),
			match: para.slice(idx, idx + q.length),
			after: para.slice(idx + q.length, end) + (end < para.length ? '…' : '')
		};
	}

	function onTextKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onclose();
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (e.shiftKey) prevMatch();
			else nextMatch();
		}
	}

	// ── Semantic search ───────────────────────────────────────────────────────
	let semanticQuery = $state('');
	let semanticResults = $state<{ text: string; chunk_index: number; similarity: number }[]>([]);
	let semanticLoading = $state(false);
	let semanticError = $state('');

	async function semanticSearch() {
		const q = semanticQuery.trim();
		if (!q) return;
		semanticLoading = true;
		semanticError = '';
		try {
			semanticResults = await trpc.documents.searchInDocument.query({ documentId, query: q });
		} catch {
			semanticError = 'Search failed.';
		} finally {
			semanticLoading = false;
		}
	}

	function scrollToChunk(chunkIndex: number, chunkText: string) {
		const indexedParas = allParas.filter((s) => s.length > 40);
		const chunkPara = indexedParas[chunkIndex] ?? chunkText.trim();
		const paraIndex = allParas.indexOf(chunkPara);
		onscrollto(paraIndex === -1 ? chunkIndex : paraIndex);
	}

	function onSemanticKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onclose();
		} else if (e.key === 'Enter') {
			semanticSearch();
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
	<!-- panel -->
	<div
		class="absolute top-16 left-1/2 w-full max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-paper-border bg-paper shadow-2xl dark:border-dark-paper-border dark:bg-dark-paper"
	>
		<!-- tab bar -->
		<div class="flex border-b border-paper-border dark:border-dark-paper-border">
			<button
				type="button"
				onclick={() => (activeTab = 'text')}
				class="flex items-center gap-1.5 border-b-2 px-4 py-2.5 font-sans text-xs font-medium transition-colors {activeTab ===
				'text'
					? 'border-accent text-accent'
					: 'border-transparent text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink'}"
			>
				<!-- magnifier -->
				<svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
					<path
						fill-rule="evenodd"
						d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
						clip-rule="evenodd"
					/>
				</svg>
				Find
			</button>
			<button
				type="button"
				onclick={() => (activeTab = 'semantic')}
				class="flex items-center gap-1.5 border-b-2 px-4 py-2.5 font-sans text-xs font-medium transition-colors {activeTab ===
				'semantic'
					? 'border-accent text-accent'
					: 'border-transparent text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink'}"
			>
				<!-- sparkles -->
				<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
					<path
						d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
					/>
				</svg>
				Semantic
			</button>
		</div>

		<!-- ── Find tab ── -->
		{#if activeTab === 'text'}
			<div class="flex items-center gap-2 px-4 py-3">
				<input
					{@attach (node) => node.focus()}
					bind:value={textQuery}
					oninput={onTextInput}
					onkeydown={onTextKeydown}
					type="text"
					placeholder="Find in document…"
					class="min-w-0 flex-1 bg-transparent font-sans text-sm text-ink placeholder:text-ink-faint focus:outline-none dark:text-dark-ink dark:placeholder:text-dark-ink-faint"
				/>
				<span
					class="shrink-0 font-sans text-xs text-ink-faint tabular-nums dark:text-dark-ink-faint"
				>
					{#if textQuery.trim()}
						{textMatches.length === 0
							? 'No results'
							: `${currentMatch + 1} / ${textMatches.length}`}
					{/if}
				</span>
				{#if !listMode}
					<button
						type="button"
						onclick={prevMatch}
						disabled={textMatches.length === 0}
						title="Previous (Shift+Enter)"
						class="rounded p-1 text-ink-muted transition-colors hover:bg-paper-ui hover:text-ink disabled:opacity-30 dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui dark:hover:text-dark-ink"
					>
						<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
							<path
								fill-rule="evenodd"
								d="M7.47 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1-1.06 1.06L8 4.81 4.28 8.53a.75.75 0 0 1-1.06-1.06l4.25-4.25Z"
								clip-rule="evenodd"
							/>
						</svg>
					</button>
					<button
						type="button"
						onclick={nextMatch}
						disabled={textMatches.length === 0}
						title="Next (Enter)"
						class="rounded p-1 text-ink-muted transition-colors hover:bg-paper-ui hover:text-ink disabled:opacity-30 dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui dark:hover:text-dark-ink"
					>
						<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
							<path
								fill-rule="evenodd"
								d="M8.53 12.78a.75.75 0 0 1-1.06 0L3.22 8.53a.75.75 0 0 1 1.06-1.06L8 11.19l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25Z"
								clip-rule="evenodd"
							/>
						</svg>
					</button>
				{/if}
				<!-- list view toggle -->
				<button
					type="button"
					onclick={() => (listMode = !listMode)}
					title="Toggle list view"
					class="rounded p-1 transition-colors {listMode
						? 'text-accent'
						: 'text-ink-muted hover:bg-paper-ui hover:text-ink dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui dark:hover:text-dark-ink'}"
				>
					<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
						<path
							fill-rule="evenodd"
							d="M2 4a1 1 0 0 1 1-1h10a1 1 0 0 1 0 2H3a1 1 0 0 1-1-1Zm0 4a1 1 0 0 1 1-1h10a1 1 0 0 1 0 2H3a1 1 0 0 1-1-1Zm0 4a1 1 0 0 1 1-1h10a1 1 0 0 1 0 2H3a1 1 0 0 1-1-1Z"
							clip-rule="evenodd"
						/>
					</svg>
				</button>
			</div>

			<!-- list of matches with context -->
			{#if listMode && textQuery.trim()}
				{#if textMatches.length > 0}
					<ul
						class="max-h-64 overflow-y-auto border-t border-paper-border py-1 dark:border-dark-paper-border"
					>
						{#each textMatches as blockIdx, i (blockIdx)}
							{@const snippet = getSnippet(blockIdx)}
							<li>
								<button
									type="button"
									onclick={() => {
										currentMatch = i;
										onscrollto(blockIdx, textQuery.trim());
									}}
									class="w-full px-4 py-2 text-left transition-colors {currentMatch === i
										? 'bg-accent/8 dark:bg-accent/12'
										: 'hover:bg-paper-ui dark:hover:bg-dark-paper-ui'}"
								>
									<p
										class="font-sans text-xs leading-relaxed text-ink-muted dark:text-dark-ink-muted"
									>
										{snippet.before}<mark
											class="rounded-sm bg-accent/25 px-0.5 font-medium text-ink not-italic dark:text-dark-ink"
											>{snippet.match}</mark
										>{snippet.after}
									</p>
								</button>
							</li>
						{/each}
					</ul>
				{:else}
					<p
						class="border-t border-paper-border px-4 py-3 font-sans text-sm text-ink-faint dark:border-dark-paper-border dark:text-dark-ink-faint"
					>
						No results found.
					</p>
				{/if}
			{/if}
		{/if}

		<!-- ── Semantic tab ── -->
		{#if activeTab === 'semantic'}
			<div>
				<div class="flex items-center gap-2 px-4 py-3">
					<input
						{@attach (node) => node.focus()}
						bind:value={semanticQuery}
						onkeydown={onSemanticKeydown}
						type="text"
						placeholder="Semantic search in this document…"
						class="min-w-0 flex-1 bg-transparent font-sans text-sm text-ink placeholder:text-ink-faint focus:outline-none dark:text-dark-ink dark:placeholder:text-dark-ink-faint"
					/>
					{#if semanticLoading}
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

				{#if semanticError}
					<p class="px-4 pb-3 font-sans text-sm text-red-500">{semanticError}</p>
				{:else if semanticResults.length > 0}
					<ul
						class="max-h-72 overflow-y-auto border-t border-paper-border py-1 dark:border-dark-paper-border"
					>
						{#each semanticResults as result (result.chunk_index)}
							<li>
								<button
									type="button"
									onclick={() => {
										onclose();
										scrollToChunk(result.chunk_index, result.text);
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
				{:else if semanticQuery.trim() && !semanticLoading}
					<p
						class="border-t border-paper-border px-4 py-3 font-sans text-sm text-ink-faint dark:border-dark-paper-border dark:text-dark-ink-faint"
					>
						No results found.
					</p>
				{/if}
			</div>
		{/if}
	</div>
</div>
