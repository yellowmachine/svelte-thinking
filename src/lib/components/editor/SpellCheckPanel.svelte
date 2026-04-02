<script lang="ts">
	import { trpc } from '$lib/utils/trpc';

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
		onaccept,
		onignore,
		onclose,
		documentText = ''
	}: {
		corrections?: SpellCorrection[];
		loading?: boolean;
		onaccept: (correction: SpellCorrection) => void;
		onignore: (word: string) => Promise<void>;
		onclose: () => void;
		documentText?: string;
	} = $props();

	let currentIndex = $state(0);
	let ignoring = $state(false);

	const current = $derived(corrections[currentIndex] ?? null);
	const total = $derived(corrections.length);

	function skip() {
		if (currentIndex < total - 1) currentIndex++;
		else onclose();
	}

	function accept() {
		if (!current) return;
		const accepted = current;
		const delta = accepted.suggestion.length - accepted.original.length;
		// Remove accepted correction and adjust offsets of subsequent ones
		corrections = corrections
			.filter((_, i) => i !== currentIndex)
			.map((c) => (c.from >= accepted.to ? { ...c, from: c.from + delta, to: c.to + delta } : c));
		// Keep currentIndex in bounds
		if (currentIndex >= corrections.length) currentIndex = Math.max(0, corrections.length - 1);
		onaccept(accepted);
		if (corrections.length === 0) onclose();
	}

	async function ignoreAlways() {
		if (!current) return;
		ignoring = true;
		try {
			await onignore(current.original);
			corrections = corrections.filter((_, i) => i !== currentIndex);
			if (currentIndex >= corrections.length) currentIndex = Math.max(0, corrections.length - 1);
			if (corrections.length === 0) onclose();
		} finally {
			ignoring = false;
		}
	}

	// Context: show ~60 chars around the error
	function getContext(c: SpellCorrection, text: string): { before: string; error: string; after: string } {
		const CONTEXT = 60;
		const before = text.slice(Math.max(0, c.from - CONTEXT), c.from);
		const error = text.slice(c.from, c.to);
		const after = text.slice(c.to, Math.min(text.length, c.to + CONTEXT));
		return { before, error, after };
	}

	// Reconstruct document text from corrections' original values isn't possible here,
	// so we pass document text via prop for context display
</script>

<div class="flex h-full flex-col">
	<!-- Header -->
	<div class="flex items-center justify-between border-b border-paper-border px-4 py-3 dark:border-dark-paper-border">
		<div class="flex items-center gap-2">
			<h3 class="font-serif text-sm font-semibold text-ink dark:text-dark-ink">Spell check</h3>
			{#if !loading && total > 0}
				<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
					{currentIndex + 1} / {total}
				</span>
			{/if}
		</div>
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

	<!-- Body -->
	<div class="flex-1 overflow-y-auto px-4 py-4">
		{#if loading}
			<div class="flex flex-col items-center gap-3 py-8 text-center">
				<div class="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
				<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">Checking…</p>
			</div>
		{:else if total === 0}
			<div class="py-8 text-center">
				<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">No corrections found.</p>
			</div>
		{:else if current}
			{@const ctx = getContext(current, documentText)}

			<!-- Context -->
			<div class="mb-4 rounded-lg border border-paper-border bg-paper-ui px-3 py-2.5 font-sans text-sm leading-relaxed dark:border-dark-paper-border dark:bg-dark-paper-ui">
				<span class="text-ink-muted dark:text-dark-ink-muted">…{ctx.before}</span><span
					class="rounded bg-red-100 px-0.5 text-red-700 dark:bg-red-900/30 dark:text-red-400">{ctx.error}</span><span
					class="text-ink-muted dark:text-dark-ink-muted">{ctx.after}…</span>
			</div>

			<!-- Suggestion -->
			<div class="mb-3">
				<p class="mb-1 font-sans text-[11px] font-semibold uppercase tracking-wide text-ink-faint dark:text-dark-ink-faint">
					Suggestion
				</p>
				<p class="font-sans text-sm text-ink dark:text-dark-ink">{current.suggestion}</p>
			</div>

			<!-- Explanation -->
			<div class="mb-5">
				<p class="mb-1 font-sans text-[11px] font-semibold uppercase tracking-wide text-ink-faint dark:text-dark-ink-faint">
					Why
				</p>
				<p class="font-sans text-xs text-ink-muted dark:text-dark-ink-muted">{current.explanation}</p>
			</div>

			<!-- Actions -->
			<div class="flex flex-col gap-2">
				<button
					onclick={accept}
					class="w-full rounded-md bg-accent px-3 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover"
				>
					Accept → "{current.suggestion}"
				</button>
				<button
					onclick={skip}
					class="w-full rounded-md border border-paper-border px-3 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
				>
					Skip
				</button>
				<button
					onclick={ignoreAlways}
					disabled={ignoring}
					class="w-full rounded-md px-3 py-2 font-sans text-xs text-ink-faint transition-colors hover:bg-paper-ui disabled:opacity-50 dark:text-dark-ink-faint dark:hover:bg-dark-paper-ui"
				>
					{ignoring ? 'Saving…' : 'Ignore always'}
				</button>
			</div>

			<!-- Progress dots -->
			{#if total > 1}
				<div class="mt-5 flex justify-center gap-1">
					{#each corrections as _, i (i)}
						<span class="h-1.5 w-1.5 rounded-full {i === currentIndex ? 'bg-accent' : 'bg-paper-border dark:bg-dark-paper-border'}"></span>
					{/each}
				</div>
			{/if}
		{/if}
	</div>
</div>
