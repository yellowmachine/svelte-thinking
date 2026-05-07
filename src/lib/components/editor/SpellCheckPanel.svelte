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

	import Spinner from '$lib/components/ui/Spinner.svelte';

	let accepting = $state<number | null>(null); // index being processed
	let ignoring = $state<number | null>(null);

	// Context: show ~50 chars before/after the error
	function getContext(c: SpellCorrection): { before: string; error: string; after: string } {
		const CONTEXT = 50;
		const before = documentText.slice(Math.max(0, c.from - CONTEXT), c.from).replace(/\n/g, ' ');
		const error = documentText.slice(c.from, c.to);
		const after = documentText
			.slice(c.to, Math.min(documentText.length, c.to + CONTEXT))
			.replace(/\n/g, ' ');
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
	<div
		class="flex items-center justify-between border-b border-paper-border px-4 py-3 dark:border-dark-paper-border"
	>
		<div class="flex items-center gap-2">
			<h3 class="font-serif text-sm font-semibold text-ink dark:text-dark-ink">
				{mode === 'grammar' ? 'Grammar assistant' : 'Spell check'}
			</h3>
			{#if !loading && corrections.length > 0}
				<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
					{corrections.length}
					{corrections.length === 1 ? 'issue' : 'issues'}
				</span>
			{/if}
		</div>
		<div class="flex items-center gap-2">
			{#if !loading && corrections.length > 1}
				<button
					onclick={acceptAll}
					class="flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 font-sans text-xs font-medium text-white transition-colors hover:bg-accent-hover"
				>
					<svg
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M2 12l4 4L14 6" />
						<path d="M8 12l4 4L22 6" />
					</svg>
					Accept all
				</button>
			{/if}
			<button
				onclick={onclose}
				class="rounded-md p-1 text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
				aria-label="Close"
			>
				<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
					<path
						d="M1 1l12 12M13 1L1 13"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
					/>
				</svg>
			</button>
		</div>
	</div>

	<!-- Body -->
	<div class="flex-1 overflow-y-auto">
		{#if loading}
			<div class="flex flex-col items-center gap-3 py-10 text-center">
				<Spinner size="lg" class="text-accent" />
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
						<p
							class="mb-2 font-sans text-xs leading-relaxed text-ink-muted dark:text-dark-ink-muted"
						>
							…{ctx.before}<span
								class="rounded bg-red-100 px-0.5 font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400"
								>{ctx.error}</span
							>{ctx.after}…
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
								class="flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 font-sans text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
							>
								<svg
									width="12"
									height="12"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<polyline points="20 6 9 17 4 12" />
								</svg>
								Accept
							</button>
							{#if mode === 'spell'}
								<button
									onclick={() => ignoreAlways(i)}
									disabled={ignoring === i}
									class="flex items-center gap-1 rounded-md px-2.5 py-1 font-sans text-xs text-ink-faint transition-colors hover:bg-paper-ui disabled:opacity-50 dark:text-dark-ink-faint dark:hover:bg-dark-paper-ui"
								>
									<svg
										width="12"
										height="12"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										aria-hidden="true"
									>
										<path
											d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"
										/>
										<line x1="1" y1="1" x2="23" y2="23" />
									</svg>
									{ignoring === i ? 'Saving…' : 'Ignore always'}
								</button>
							{:else}
								<button
									onclick={() => {
										corrections = corrections.filter((_, j) => j !== i);
									}}
									class="flex items-center gap-1 rounded-md px-2.5 py-1 font-sans text-xs text-ink-faint transition-colors hover:bg-paper-ui dark:text-dark-ink-faint dark:hover:bg-dark-paper-ui"
								>
									<svg
										width="12"
										height="12"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										aria-hidden="true"
									>
										<path d="M18 6L6 18M6 6l12 12" />
									</svg>
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
