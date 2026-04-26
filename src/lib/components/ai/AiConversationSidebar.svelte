<script lang="ts">
	import { untrack } from 'svelte';
	import { trpc } from '$lib/utils/trpc';

	type Conversation = {
		id: string;
		title?: string | null;
		updatedAt: Date | string;
	};

	let {
		conversations,
		activeConvId,
		projectId,
		projectTitle,
		isOwner,
		loadingConv,
		agentSystemPrompt,
		onselect,
		onnew,
		ondeleteconversation
	}: {
		conversations: Conversation[];
		activeConvId: string | null;
		projectId: string;
		projectTitle: string;
		isOwner: boolean;
		loadingConv: boolean;
		agentSystemPrompt: string | null;
		onselect: (conv: Conversation) => void;
		onnew: () => void;
		ondeleteconversation: (id: string, e: MouseEvent) => void;
	} = $props();

	let promptText = $state(untrack(() => agentSystemPrompt ?? ''));
	let promptSaving = $state(false);
	let promptSaved = $state(false);
	let showPromptEditor = $state(false);

	async function savePrompt() {
		promptSaving = true;
		promptSaved = false;
		try {
			await trpc.projects.updateAgentPrompt.mutate({
				projectId,
				agentSystemPrompt: promptText.trim() || null
			});
			promptSaved = true;
			setTimeout(() => {
				promptSaved = false;
			}, 2000);
		} finally {
			promptSaving = false;
		}
	}

	function formatDate(date: Date | string) {
		return new Date(date).toLocaleDateString('es', { day: 'numeric', month: 'short' });
	}
</script>

<aside
	class="flex w-64 shrink-0 flex-col border-r border-paper-border bg-paper dark:border-dark-paper-border dark:bg-dark-paper"
>
	<div
		class="flex items-center justify-between border-b border-paper-border px-4 py-3 dark:border-dark-paper-border"
	>
		<a
			href="/projects/{projectId}"
			class="flex items-center gap-1.5 font-sans text-xs text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
		>
			<svg
				width="14"
				height="14"
				viewBox="0 0 16 16"
				fill="none"
				aria-hidden="true"
			>
				<path
					d="M10 12L6 8l4-4"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
			{projectTitle}
		</a>
		<button
			type="button"
			onclick={onnew}
			title="New conversation"
			class="rounded-md p-1 text-ink-muted transition-colors hover:bg-paper-ui hover:text-ink dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui dark:hover:text-dark-ink"
		>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
			</svg>
		</button>
	</div>

	<div class="flex-1 overflow-y-auto py-2">
		{#if conversations.length === 0}
			<p class="px-4 py-6 text-center font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
				Sin conversaciones
			</p>
		{:else}
			{#each conversations as conv (conv.id)}
				<div
					class="group relative flex items-start transition-colors hover:bg-paper-ui dark:hover:bg-dark-paper-ui {activeConvId ===
					conv.id
						? 'bg-paper-ui dark:bg-dark-paper-ui'
						: ''}"
				>
					<button
						type="button"
						onclick={() => onselect(conv)}
						disabled={loadingConv}
						class="flex min-w-0 flex-1 flex-col px-4 py-2.5 text-left"
					>
						<span class="block truncate font-sans text-sm text-ink dark:text-dark-ink">
							{conv.title ?? 'Conversation'}
						</span>
						<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
							{formatDate(conv.updatedAt)}
						</span>
					</button>
					<button
						type="button"
						aria-label="Delete conversation"
						onclick={(e) => ondeleteconversation(conv.id, e)}
						class="mr-2 mt-2.5 shrink-0 rounded p-0.5 text-ink-faint opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100 dark:text-dark-ink-faint"
					>
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path
								d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					</button>
				</div>
			{/each}
		{/if}
	</div>

	{#if isOwner}
		<div class="shrink-0 border-t border-paper-border dark:border-dark-paper-border">
			<button
				type="button"
				onclick={() => (showPromptEditor = !showPromptEditor)}
				class="flex w-full items-center justify-between px-4 py-2.5 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-ui hover:text-ink dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui dark:hover:text-dark-ink"
			>
				<span class="flex items-center gap-1.5">
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" stroke-width="1.5" />
						<path
							d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
							stroke="currentColor"
							stroke-width="1.5"
						/>
					</svg>
					System prompt
				</span>
				<svg
					width="12"
					height="12"
					viewBox="0 0 24 24"
					fill="none"
					aria-hidden="true"
					class="transition-transform {showPromptEditor ? 'rotate-180' : ''}"
				>
					<path
						d="M6 9l6 6 6-6"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</button>
			{#if showPromptEditor}
				<div class="px-4 pb-4">
					<p
						class="mb-2 font-sans text-[11px] leading-relaxed text-ink-faint dark:text-dark-ink-faint"
					>
						Custom instructions prepended to the agent's base prompt. Only you can see or edit this.
					</p>
					<textarea
						bind:value={promptText}
						placeholder="E.g. You are an assistant specialized in economics research. Always cite sources when possible."
						rows="6"
						class="w-full resize-none rounded-lg border border-paper-border bg-paper-ui px-3 py-2 font-sans text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
					></textarea>
					<div class="mt-2 flex items-center justify-end gap-2">
						{#if promptSaved}
							<span class="font-sans text-xs text-green-600 dark:text-green-400">Saved</span>
						{/if}
						<button
							type="button"
							onclick={savePrompt}
							disabled={promptSaving}
							class="rounded-md bg-accent px-3 py-1.5 font-sans text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
						>
							{promptSaving ? 'Saving…' : 'Save'}
						</button>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</aside>
