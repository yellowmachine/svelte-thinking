<script lang="ts">
	import type { PendingEditorAction } from '$lib/server/trpc/routers/ai';

	type Props = {
		action: PendingEditorAction;
		onconfirm: (action: PendingEditorAction) => void;
		ondiscard: () => void;
	};

	let { action, onconfirm, ondiscard }: Props = $props();

	let status: 'idle' | 'done' | 'discarded' = $state('idle');

	const PREVIEW_LIMIT = 240;

	function truncate(text: string) {
		return text.length > PREVIEW_LIMIT ? text.slice(0, PREVIEW_LIMIT) + '…' : text;
	}

	const showDiff = $derived(action.type === 'replace_text' || action.type === 'insert_after');
	const originalText = $derived(action.type === 'replace_text' ? action.anchorText : '');
	const newText = $derived(
		action.type === 'replace_text'
			? action.replacement
			: action.type === 'insert_after'
				? action.content
				: ''
	);
	const label = $derived(
		action.type === 'replace_text'
			? 'Replace'
			: action.type === 'insert_index'
				? 'Insert index'
				: 'Insert'
	);
	const indexDescription = $derived(
		action.type === 'insert_index'
			? action.kind === 'toc'
				? 'Table of contents, inserted at the top of the document.'
				: 'Onomastic index, inserted at the end of the document.'
			: ''
	);

	function confirm() {
		if (status !== 'idle') return;
		status = 'done';
		onconfirm(action);
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
		<div class="px-3 pt-3">
			<!-- Label + explanation -->
			<p
				class="font-sans text-[11px] font-semibold tracking-wide uppercase
				{status === 'done' ? 'text-green-600 dark:text-green-400' : 'text-accent'}"
			>
				{status === 'done' ? 'Applied' : label}
			</p>
			<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
				{action.explanation}
			</p>

			{#if status === 'idle' && showDiff}
				<!-- Diff preview -->
				<div class="mt-2.5 space-y-1.5">
					<div class="rounded-lg bg-red-50 px-2.5 py-2 dark:bg-red-950/30">
						<p
							class="mb-0.5 font-sans text-[10px] font-semibold tracking-wide text-red-500 uppercase dark:text-red-400"
						>
							Before
						</p>
						<p
							class="font-mono text-xs leading-relaxed text-red-700 line-through dark:text-red-300"
						>
							{truncate(originalText)}
						</p>
					</div>
					<div class="rounded-lg bg-green-50 px-2.5 py-2 dark:bg-green-950/30">
						<p
							class="mb-0.5 font-sans text-[10px] font-semibold tracking-wide text-green-600 uppercase dark:text-green-400"
						>
							After
						</p>
						<p class="font-mono text-xs leading-relaxed text-green-800 dark:text-green-200">
							{truncate(newText)}
						</p>
					</div>
				</div>
			{:else if status === 'idle' && action.type === 'insert_index'}
				<div class="mt-2.5 rounded-lg bg-green-50 px-2.5 py-2 dark:bg-green-950/30">
					<p class="font-sans text-xs leading-relaxed text-green-800 dark:text-green-200">
						{indexDescription}
					</p>
				</div>
			{/if}
		</div>

		<!-- Actions -->
		<div class="flex justify-end gap-2 px-3 pt-2 pb-2.5">
			{#if status === 'done'}
				<span class="font-sans text-xs text-green-600 dark:text-green-400"
					>✓ Applied to document</span
				>
			{:else}
				<button
					type="button"
					onclick={discard}
					class="rounded-lg px-2.5 py-1 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-border disabled:opacity-40 dark:text-dark-ink-muted dark:hover:bg-dark-paper-border"
				>
					Discard
				</button>
				<button
					type="button"
					onclick={confirm}
					class="flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 font-sans text-xs font-medium text-white transition-opacity hover:opacity-90"
				>
					<svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path
							d="M20 6L9 17l-5-5"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					Apply
				</button>
			{/if}
		</div>
	</div>
{/if}
