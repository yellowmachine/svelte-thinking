<script lang="ts">
export type SpellCorrection = {
		original: string;
		suggestion: string;
		explanation: string;
		from: number;
		to: number;
	};

	let {
		corrections = $bindable<SpellCorrection[]>([]),
		loading = false,
		documentText = '',
		mode = 'spell',
		onaccept,
		onignore,
		onclose,
		onhover,
		onhoverend
	}: {
		corrections?: SpellCorrection[];
		loading?: boolean;
		documentText?: string;
		mode?: 'spell' | 'grammar';
		onaccept: (correction: SpellCorrection) => void;
		onignore: (word: string) => Promise<void>;
		onclose: () => void;
		onhover?: (correction: SpellCorrection) => void;
		onhoverend?: () => void;
	} = $props();

	let accepting = $state<number | null>(null); // index being processed
	let ignoring = $state<number | null>(null);

	// Context: show ~50 chars before/after the error
	function getContext(c: SpellCorrection): { before: string; error: string; after: string } {
		const CONTEXT = 50;
		const before = documentText.slice(Math.max(0, c.from - CONTEXT), c.from).replace(/\n/g, ' ');
		const error = documentText.slice(c.from, c.to);
		const after = documentText.slice(c.to, Math.min(documentText.length, c.to + CONTEXT)).replace(/\n/g, ' ');
		return { before, error, after };
	}

	function accept(index: number) {
		const correction = corrections[index];
		if (!correction) return;
		accepting = index;
		const delta = correction.suggestion.length - correction.original.length;
		corrections = corrections
			.filter((_, i) => i !== index)
			.map((c) => (c.from >= correction.to ? { ...c, from: c.from + delta, to: c.to + delta } : c));
		onaccept(correction);
		accepting = null;
	}

	async function ignoreAlways(index: number) {
		const correction = corrections[index];
		if (!correction) return;
		ignoring = index;
		try {
			await onignore(correction.original);
			corrections = corrections.filter((_, i) => i !== index);
		} finally {
			ignoring = null;
		}
	}

	function acceptAll() {
		// Apply from last to first to keep offsets valid
		const sorted = [...corrections.map((c, i) => ({ ...c, i }))].sort((a, b) => b.from - a.from);
		for (const c of sorted) onaccept(c);
		corrections = [];
		onclose();
	}
</script>

<div class="flex h-full flex-col">
	<!-- Header -->
	<div class="flex items-center justify-between border-b border-paper-border px-4 py-3 dark:border-dark-paper-border">
		<div class="flex items-center gap-2">
			<h3 class="font-serif text-sm font-semibold text-ink dark:text-dark-ink">
			{mode === 'grammar' ? 'Grammar assistant' : 'Spell check'}
		</h3>
			{#if !loading && corrections.length > 0}
				<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
					{corrections.length} {corrections.length === 1 ? 'issue' : 'issues'}
				</span>
			{/if}
		</div>
		<div class="flex items-center gap-2">
			{#if !loading && corrections.length > 1}
				<button
					onclick={acceptAll}
					class="rounded-md bg-accent px-2.5 py-1 font-sans text-xs font-medium text-white transition-colors hover:bg-accent-hover"
				>
					Accept all
				</button>
			{/if}
			<button
				onclick={onclose}
				class="rounded-md p-1 text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
				aria-label="Close"
			>
				<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
					<path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
				</svg>
			</button>
		</div>
	</div>

	<!-- Body -->
	<div class="flex-1 overflow-y-auto">
		{#if loading}
			<div class="flex flex-col items-center gap-3 py-10 text-center">
				<div class="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
				<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">Checking…</p>
			</div>
		{:else if corrections.length === 0}
			<div class="py-10 text-center">
				<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">No issues found.</p>
			</div>
		{:else}
			<ul class="divide-y divide-paper-border dark:divide-dark-paper-border">
				{#each corrections as correction, i (correction.from)}
					{@const ctx = getContext(correction)}
					<li
						class="px-4 py-3"
						onmouseenter={() => onhover?.(correction)}
						onmouseleave={() => onhoverend?.()}
					>
						<!-- Context -->
						<p class="mb-2 font-sans text-xs leading-relaxed text-ink-muted dark:text-dark-ink-muted">
							…{ctx.before}<span
								class="rounded bg-red-100 px-0.5 font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400"
								>{ctx.error}</span>{ctx.after}…
						</p>

						<!-- Suggestion + explanation -->
						<div class="mb-2.5 flex items-baseline gap-1.5">
							<span class="font-sans text-sm font-medium text-ink dark:text-dark-ink">
								→ {correction.suggestion}
							</span>
							<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
								{correction.explanation}
							</span>
						</div>

						<!-- Actions -->
						<div class="flex items-center gap-2">
							<button
								onclick={() => accept(i)}
								disabled={accepting === i}
								class="rounded-md bg-accent px-2.5 py-1 font-sans text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
							>
								Accept
							</button>
							{#if mode === 'spell'}
							<button
								onclick={() => ignoreAlways(i)}
								disabled={ignoring === i}
								class="rounded-md px-2.5 py-1 font-sans text-xs text-ink-faint transition-colors hover:bg-paper-ui disabled:opacity-50 dark:text-dark-ink-faint dark:hover:bg-dark-paper-ui"
							>
								{ignoring === i ? 'Saving…' : 'Ignore always'}
							</button>
						{:else}
							<button
								onclick={() => { corrections = corrections.filter((_, j) => j !== i); }}
								class="rounded-md px-2.5 py-1 font-sans text-xs text-ink-faint transition-colors hover:bg-paper-ui dark:text-dark-ink-faint dark:hover:bg-dark-paper-ui"
							>
								Dismiss
							</button>
						{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>
