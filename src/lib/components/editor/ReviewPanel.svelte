<script lang="ts">
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { trpc } from '$lib/utils/trpc';

	type ReviewResult = {
		requirements: { name: string; covered: boolean; note: string }[];
		uncitedRefs: string[];
	};

	let {
		projectId,
		documentId,
		hasAiKey,
		onclose,
		oninsertcitation
	}: {
		projectId: string;
		documentId: string;
		hasAiKey: boolean;
		onclose: () => void;
		oninsertcitation: (citeKey: string) => void;
	} = $props();

	let loadingReview = $state(false);
	let reviewResult = $state<ReviewResult | null>(null);
	let reviewError = $state('');
	let reviewQuestions = $state<string[] | null>(null);
	let loadingQuestions = $state(false);
	let questionsError = $state('');

	const NO_KEY_MSG = 'No AI key configured. Go to Settings → AI to add one.';

	function isNoKeyError(e: unknown): boolean {
		return !!(
			e &&
			typeof e === 'object' &&
			'data' in e &&
			(e as { data?: { code?: string } }).data?.code === 'PRECONDITION_FAILED'
		);
	}

	async function runReview() {
		if (loadingReview) return;
		loadingReview = true;
		reviewError = '';
		reviewResult = null;
		try {
			reviewResult = await trpc.ai.reviewDocument.mutate({ projectId, documentId });
		} catch (e: unknown) {
			reviewError = isNoKeyError(e)
				? NO_KEY_MSG
				: e instanceof Error
					? e.message
					: 'Error reviewing document.';
		} finally {
			loadingReview = false;
		}
	}

	async function runReviewQuestions() {
		if (loadingQuestions) return;
		loadingQuestions = true;
		questionsError = '';
		reviewQuestions = null;
		try {
			reviewQuestions = await trpc.ai.generateReviewQuestions.mutate({ projectId, documentId });
		} catch (e: unknown) {
			questionsError = isNoKeyError(e)
				? NO_KEY_MSG
				: e instanceof Error
					? e.message
					: 'Error generating questions.';
		} finally {
			loadingQuestions = false;
		}
	}
</script>

<div
	class="flex w-80 shrink-0 flex-col overflow-hidden border-l border-paper-border bg-paper dark:border-dark-paper-border dark:bg-dark-paper"
>
	<div
		class="flex items-center justify-between border-b border-paper-border px-4 py-3 dark:border-dark-paper-border"
	>
		<h3 class="font-serif text-sm font-semibold text-ink dark:text-dark-ink">Document review</h3>
		<div class="flex items-center gap-2">
			{#if loadingReview}
				<Spinner size="sm" class="text-accent" />
			{/if}
			<button
				type="button"
				onclick={onclose}
				class="text-ink-faint transition-colors hover:text-ink-muted dark:text-dark-ink-faint dark:hover:text-dark-ink-muted"
				aria-label="Close review"
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
	</div>

	<div class="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
		{#if !reviewResult && !loadingReview}
			<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
				Checks each project requirement against the document content, and identifies relevant
				references that aren't cited yet.
			</p>
			<button
				type="button"
				onclick={runReview}
				class="flex items-center justify-center gap-2 rounded-lg bg-accent py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover"
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
					<polygon points="5 3 19 12 5 21 5 3" />
				</svg>
				Run review
			</button>
		{/if}

		{#if loadingReview && !reviewResult}
			<p class="py-6 text-center font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				Analysing document…
			</p>
		{/if}

		{#if reviewError}
			<div
				class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-xs text-red-600 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-400"
			>
				{#if reviewError === NO_KEY_MSG}
					No AI key configured. <a
						href="/settings?tab=ai"
						class="underline underline-offset-2 hover:opacity-80">Go to Settings → AI</a
					> to add one.
				{:else}
					{reviewError}
				{/if}
			</div>
		{/if}

		{#if reviewResult}
			{#if reviewResult.requirements.length > 0}
				<div>
					<p
						class="mb-2 font-sans text-[11px] font-medium tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint"
					>
						Requirements
					</p>
					<div class="flex flex-col gap-2">
						{#each reviewResult.requirements as req (req.name)}
							<div
								class="rounded-lg border {req.covered
									? 'border-green-200 bg-green-50 dark:border-green-800/40 dark:bg-green-900/10'
									: 'border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-900/10'} px-3 py-2"
							>
								<div class="flex items-start gap-2">
									<span
										class="mt-0.5 shrink-0 text-sm {req.covered
											? 'text-green-600 dark:text-green-400'
											: 'text-amber-600 dark:text-amber-400'}"
									>
										{req.covered ? '✓' : '✗'}
									</span>
									<div>
										<p class="font-sans text-xs font-medium text-ink dark:text-dark-ink">
											{req.name}
										</p>
										{#if req.note}
											<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
												{req.note}
											</p>
										{/if}
									</div>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			{#if reviewResult.uncitedRefs.length > 0}
				<div>
					<p
						class="mb-2 font-sans text-[11px] font-medium tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint"
					>
						Relevant but uncited
					</p>
					<div class="flex flex-col gap-1.5">
						{#each reviewResult.uncitedRefs as citeKey (citeKey)}
							<button
								type="button"
								onclick={() => oninsertcitation(citeKey)}
								title="Insert citation"
								class="flex items-center justify-between rounded-md border border-paper-border bg-paper-ui px-3 py-2 text-left transition-colors hover:border-accent/40 dark:border-dark-paper-border dark:bg-dark-paper-ui"
							>
								<span class="font-mono text-xs text-ink dark:text-dark-ink">[[@{citeKey}]]</span>
								<span class="font-sans text-[10px] text-ink-faint dark:text-dark-ink-faint"
									>insert</span
								>
							</button>
						{/each}
					</div>
				</div>
			{:else if reviewResult.requirements.length > 0}
				<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
					All relevant references are cited.
				</p>
			{/if}

			<div class="border-t border-paper-border pt-4 dark:border-dark-paper-border">
				<p
					class="mb-2 font-sans text-[11px] font-medium tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint"
				>
					Critical questions
				</p>
				{#if !reviewQuestions && !loadingQuestions}
					<p class="mb-2 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
						Questions a peer reviewer would likely raise about this document.
					</p>
					<button
						type="button"
						onclick={runReviewQuestions}
						disabled={!hasAiKey}
						class="flex items-center gap-1.5 rounded-md border border-paper-border px-3 py-1.5 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-ui disabled:opacity-40 dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
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
							<circle cx="12" cy="12" r="10" />
							<path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
							<line x1="12" y1="17" x2="12.01" y2="17" stroke-width="2" />
						</svg>
						Generate questions
					</button>
				{:else if loadingQuestions}
					<p class="py-2 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">Generating…</p>
				{:else if questionsError}
					<p class="font-sans text-xs text-red-500">{questionsError}</p>
				{:else if reviewQuestions}
					<ol class="flex flex-col gap-2">
						{#each reviewQuestions as q, i (i)}
							<li class="flex items-start gap-2">
								<span
									class="mt-0.5 shrink-0 font-sans text-[10px] font-semibold text-ink-faint dark:text-dark-ink-faint"
									>{i + 1}.</span
								>
								<span class="font-sans text-xs leading-relaxed text-ink dark:text-dark-ink"
									>{q}</span
								>
							</li>
						{/each}
					</ol>
					<button
						type="button"
						onclick={runReviewQuestions}
						disabled={loadingQuestions}
						class="mt-3 flex items-center gap-1.5 rounded-md border border-paper-border px-3 py-1.5 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-ui disabled:opacity-40 dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
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
							<polyline points="23 4 23 10 17 10" />
							<path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
						</svg>
						Regenerate
					</button>
				{/if}
			</div>

			<button
				type="button"
				onclick={runReview}
				disabled={loadingReview}
				class="mt-auto flex items-center gap-1.5 rounded-md border border-paper-border px-3 py-1.5 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-ui disabled:opacity-40 dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
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
					<polyline points="23 4 23 10 17 10" />
					<path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
				</svg>
				Re-run review
			</button>
		{/if}
	</div>
</div>
