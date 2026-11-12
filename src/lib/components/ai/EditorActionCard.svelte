<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
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
				: action.type === 'set_diagram_code'
					? 'Update diagram'
					: 'Insert'
	);
	const diagramCode = $derived(action.type === 'set_diagram_code' ? action.code : '');
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
		class="mt-2 overflow-hidden rounded-xl border transition-colors {status === 'done'
			? 'border-success-border bg-success-bg dark:bg-green-950/20'
			: 'border-accent/20 bg-accent/5 dark:border-accent/15 dark:bg-accent/5'}"
	>
		<div class="px-3 pt-3">
			<!-- Label + explanation -->
			<p
				class="font-sans text-[11px] font-semibold tracking-wide uppercase {status === 'done'
					? 'text-success'
					: 'text-accent-ink'}"
			>
				{status === 'done' ? 'Applied' : label}
			</p>
			<p class="mt-0.5 font-sans text-xs text-ink-muted">
				{action.explanation}
			</p>

			{#if status === 'idle' && showDiff}
				<!-- Diff preview -->
				<div class="mt-2.5 space-y-1.5">
					<div class="rounded-lg bg-danger-bg px-2.5 py-2">
						<p
							class="mb-0.5 font-sans text-[10px] font-semibold tracking-wide text-danger uppercase"
						>
							Before
						</p>
						<p class="font-mono text-xs leading-relaxed text-danger line-through">
							{truncate(originalText)}
						</p>
					</div>
					<div class="rounded-lg bg-success-bg px-2.5 py-2">
						<p
							class="mb-0.5 font-sans text-[10px] font-semibold tracking-wide text-success uppercase"
						>
							After
						</p>
						<p class="font-mono text-xs leading-relaxed text-success">
							{truncate(newText)}
						</p>
					</div>
				</div>
			{:else if status === 'idle' && action.type === 'insert_index'}
				<div class="mt-2.5 rounded-lg bg-success-bg px-2.5 py-2">
					<p class="font-sans text-xs leading-relaxed text-success">
						{indexDescription}
					</p>
				</div>
			{:else if status === 'idle' && action.type === 'set_diagram_code'}
				<div class="mt-2.5 rounded-lg bg-success-bg px-2.5 py-2">
					<p class="font-mono text-xs leading-relaxed whitespace-pre-wrap text-success">
						{truncate(diagramCode)}
					</p>
				</div>
			{/if}
		</div>

		<!-- Actions -->
		<div class="flex justify-end gap-2 px-3 pt-2 pb-2.5">
			{#if status === 'done'}
				<span class="font-sans text-xs text-success">✓ Applied to document</span>
			{:else}
				<button
					type="button"
					onclick={discard}
					class="rounded-lg px-2.5 py-1 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-border disabled:opacity-40"
				>
					Discard
				</button>
				<button
					type="button"
					onclick={confirm}
					class="flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 font-sans text-xs font-medium text-white transition-opacity hover:opacity-90"
				>
					<Check size={10} strokeWidth={1.75} aria-hidden="true" />
					Apply
				</button>
			{/if}
		</div>
	</div>
{/if}
