<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import X from '@lucide/svelte/icons/x';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { trpc } from '$lib/utils/trpc';

	import { resolve } from '$app/paths';
	type SelectionSnapshot = { text: string; from: number; to: number };

	let {
		projectId,
		onclose,
		ongetselection,
		oninsertcursor,
		onreplacerange
	}: {
		projectId: string;
		onclose: () => void;
		ongetselection: () => SelectionSnapshot | null;
		oninsertcursor: (text: string) => void;
		onreplacerange: (from: number, to: number, text: string) => void;
	} = $props();

	let draftMode = $state<'new' | 'rewrite'>('new');
	let draftInstruction = $state('');
	let draftResult = $state('');
	let loadingDraft = $state(false);
	let draftError = $state('');
	let capturedSelection = $state<SelectionSnapshot | null>(null);

	const NO_KEY_MSG = 'No AI key configured. Go to Settings → AI to add one.';

	function isNoKeyError(e: unknown): boolean {
		return !!(
			e &&
			typeof e === 'object' &&
			'data' in e &&
			(e as { data?: { code?: string } }).data?.code === 'PRECONDITION_FAILED'
		);
	}

	function setDraftMode(m: 'new' | 'rewrite') {
		draftMode = m;
		draftResult = '';
		draftError = '';
		capturedSelection = null;
	}

	function captureSelection() {
		capturedSelection = ongetselection();
		draftResult = '';
		draftError = '';
	}

	async function runDraft() {
		if (!draftInstruction.trim() || loadingDraft) return;
		if (draftMode === 'rewrite' && !capturedSelection) return;
		loadingDraft = true;
		draftError = '';
		draftResult = '';
		try {
			if (draftMode === 'rewrite') {
				const instruction = `Rewrite the following text fragment according to this instruction: ${draftInstruction}\n\nOriginal text:\n${capturedSelection!.text}`;
				const { text } = await trpc.ai.draftSection.mutate({
					projectId,
					instruction,
					documentContext: undefined
				});
				draftResult = text;
			} else {
				const { text } = await trpc.ai.draftSection.mutate({
					projectId,
					instruction: draftInstruction,
					documentContext: undefined
				});
				draftResult = text;
			}
		} catch (e: unknown) {
			draftError = isNoKeyError(e)
				? NO_KEY_MSG
				: e instanceof Error
					? e.message
					: 'Error generating draft.';
		} finally {
			loadingDraft = false;
		}
	}

	function acceptDraft() {
		if (!draftResult) return;
		if (draftMode === 'rewrite' && capturedSelection) {
			const wrapped = `> ⚠️ AI DRAFT — review and rewrite before publishing\n\n${draftResult}\n\n> ⚠️ END AI DRAFT`;
			onreplacerange(capturedSelection.from, capturedSelection.to, wrapped);
			capturedSelection = null;
		} else {
			const wrapped = `\n\n> ⚠️ AI DRAFT — review and rewrite before publishing\n\n${draftResult}\n\n> ⚠️ END AI DRAFT\n\n`;
			oninsertcursor(wrapped);
		}
		draftResult = '';
		draftInstruction = '';
	}

	function rejectDraft() {
		draftResult = '';
	}

	function handleClose() {
		capturedSelection = null;
		draftResult = '';
		onclose();
	}
</script>

<div class="flex w-80 shrink-0 flex-col overflow-hidden border-l border-paper-border bg-paper">
	<div class="flex items-center justify-between border-b border-paper-border px-4 py-3">
		<h3 class="font-serif text-sm font-semibold text-ink">Draft assistant</h3>
		<button
			type="button"
			onclick={handleClose}
			class="text-ink-faint transition-colors hover:text-ink-muted"
			aria-label="Close draft assistant"
		>
			<X size={14} strokeWidth={1.75} aria-hidden="true" />
		</button>
	</div>

	<div class="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
		<div class="flex overflow-hidden rounded-lg border border-paper-border">
			<button
				type="button"
				onclick={() => setDraftMode('new')}
				class="flex-1 py-1.5 font-sans text-xs transition-colors {draftMode === 'new'
					? 'bg-accent text-white'
					: 'text-ink-muted hover:bg-paper-ui'}"
			>
				New text
			</button>
			<button
				type="button"
				onclick={() => setDraftMode('rewrite')}
				class="flex-1 border-l border-paper-border py-1.5 font-sans text-xs transition-colors {draftMode ===
				'rewrite'
					? 'bg-accent text-white'
					: 'text-ink-muted hover:bg-paper-ui'}"
			>
				Rewrite selection
			</button>
		</div>

		{#if draftMode === 'new'}
			<p class="font-sans text-xs text-ink-faint">
				Describe what to write. The assistant will use your project references, requirements, and
				existing documents as context.
			</p>
		{:else}
			<div class="flex flex-col gap-2">
				<p class="font-sans text-xs text-ink-faint">
					Select text in the editor, then capture it here.
				</p>
				<button
					type="button"
					onclick={captureSelection}
					class="flex items-center gap-1.5 rounded-lg border border-paper-border px-3 py-1.5 font-sans text-xs text-ink-muted transition-colors hover:border-accent/40 hover:text-ink"
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
							d="M8 2H6a2 2 0 00-2 2v2M16 2h2a2 2 0 012 2v2M22 16v2a2 2 0 01-2 2h-2M8 22H6a2 2 0 01-2-2v-2"
						/>
					</svg>
					Capture selection
				</button>
				{#if capturedSelection}
					<div
						class="rounded-lg border border-paper-border bg-paper-ui px-3 py-2 font-mono text-xs text-ink-muted"
						style="max-height: 80px; overflow-y: auto;"
					>
						{capturedSelection.text}
					</div>
				{/if}
			</div>
		{/if}

		<textarea
			bind:value={draftInstruction}
			placeholder={draftMode === 'new'
				? 'E.g.: Write an introductory paragraph for the methodology section…'
				: 'E.g.: Make this more formal, add a citation, expand this argument…'}
			rows="3"
			class="w-full resize-none rounded-lg border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
		></textarea>

		<button
			type="button"
			onclick={runDraft}
			disabled={!draftInstruction.trim() ||
				loadingDraft ||
				(draftMode === 'rewrite' && !capturedSelection)}
			class="flex items-center justify-center gap-2 rounded-lg bg-accent py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
		>
			{#if loadingDraft}
				<Spinner size="sm" class="text-white" />
				Generating…
			{:else}
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
					<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
				</svg>
				Generate
			{/if}
		</button>

		{#if draftError}
			<div
				class="rounded-lg border border-danger-border bg-danger-bg px-3 py-2 font-sans text-xs text-danger"
			>
				{#if draftError === NO_KEY_MSG}
					No AI key configured. <a
						href={resolve('/settings?tab=ai')}
						class="underline underline-offset-2 hover:opacity-80">Go to Settings → AI</a
					> to add one.
				{:else}
					{draftError}
				{/if}
			</div>
		{/if}

		{#if draftResult}
			<div class="flex flex-col gap-2">
				{#if draftMode === 'rewrite' && capturedSelection}
					<div class="rounded-xl border border-accent/20 bg-accent/5 p-3">
						<div class="mb-2 space-y-1 rounded-md bg-paper px-2.5 py-2 font-mono text-xs">
							<p class="text-danger line-through opacity-70">{capturedSelection.text}</p>
							<p class="text-success">{draftResult}</p>
						</div>
					</div>
				{:else}
					<div
						class="rounded-lg border border-paper-border bg-paper-ui px-3 py-2.5 font-sans text-sm leading-relaxed text-ink"
						style="white-space: pre-wrap;"
					>
						{draftResult}
					</div>
				{/if}
				<div class="flex gap-2">
					<button
						type="button"
						onclick={acceptDraft}
						class="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-accent py-1.5 font-sans text-xs font-medium text-white transition-colors hover:bg-accent-hover"
					>
						<Check size={12} strokeWidth={1.75} aria-hidden="true" />
						{draftMode === 'rewrite' ? 'Accept' : 'Insert at cursor'}
					</button>
					<button
						type="button"
						onclick={rejectDraft}
						class="flex items-center gap-1.5 rounded-md border border-paper-border px-3 py-1.5 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-ui"
					>
						<X size={12} strokeWidth={1.75} aria-hidden="true" />
						Reject
					</button>
				</div>
			</div>
		{/if}
	</div>
</div>
