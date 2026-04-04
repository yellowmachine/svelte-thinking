<script lang="ts">
	import { trpc } from '$lib/utils/trpc';
	import { tick } from 'svelte';
	import { MODELS } from '$lib/ai-config';

	type Props = {
		projectId: string;
		documentId: string;
		documentTitle: string;
		onClose: () => void;
		orgId?: string | null;
		defaultModel?: string;
	};

	let {
		projectId,
		documentId,
		documentTitle,
		onClose,
		orgId = null,
		defaultModel = ''
	}: Props = $props();

	const toolCallingModels = MODELS.filter((m) => m.toolCalling);
	let selectedModel = $state(defaultModel);

	type Message = {
		role: 'user' | 'assistant';
		content: string;
		docsUsed?: { id: string; title: string }[];
	};

	const CONV_KEY = `ai-conv-${documentId}`;

	const SHORTCUTS = [
		{ label: 'Requirements gap', prompt: "Which project requirements haven't I covered yet in this document?" },
		{ label: 'Missing citations', prompt: 'Which references in my bibliography am I not citing but should be?' },
		{ label: 'Argument flow', prompt: 'Does the argument flow logically? Where are the weak points?' },
		{ label: 'Summary so far', prompt: 'Give me a brief summary of what I have written so far.' }
	];

	let messages = $state<Message[]>([]);
	let conversationId = $state<string | undefined>(undefined);
	let input = $state('');
	let loading = $state(false);
	let error = $state('');
	let historyLoaded = $state(false);
	let messagesEl = $state<HTMLDivElement | null>(null);

	async function scrollToBottom() {
		await tick();
		if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
	}

	$effect(() => {
		const stored = localStorage.getItem(CONV_KEY);
		if (stored) {
			conversationId = stored;
			loadHistory(stored);
		} else {
			historyLoaded = true;
		}
	});

	async function loadHistory(convId: string) {
		try {
			const { messages: rows } = await trpc.ai.getConversation.query(convId);
			messages = rows
				.filter((m) => m.role === 'user' || m.role === 'assistant')
				.map((m) => ({
					role: m.role as 'user' | 'assistant',
					content: m.content,
					docsUsed: (m.docsUsed as { id: string; title: string }[] | null) ?? undefined
				}));
			await scrollToBottom();
		} catch {
			// conversation may have been deleted — start fresh
			localStorage.removeItem(CONV_KEY);
			conversationId = undefined;
		} finally {
			historyLoaded = true;
		}
	}

	function useShortcut(prompt: string) {
		input = prompt;
	}

	async function send() {
		const text = input.trim();
		if (!text || loading) return;

		// Prefix with document context so the agent knows what's being edited
		const withContext = `[Currently editing: "${documentTitle}"]\n${text}`;

		messages = [...messages, { role: 'user', content: text }];
		input = '';
		loading = true;
		error = '';
		await scrollToBottom();

		try {
			const result = await trpc.ai.sendMessage.mutate({
				projectId,
				conversationId,
				message: withContext,
				...((!orgId && selectedModel) ? { modelOverride: selectedModel } : {})
			});

			conversationId = result.conversationId;
			localStorage.setItem(CONV_KEY, result.conversationId);

			messages = [
				...messages,
				{
					role: 'assistant',
					content: result.message.content,
					docsUsed: result.message.docsUsed as { id: string; title: string }[] | undefined
				}
			];
			await scrollToBottom();
		} catch (e: unknown) {
			const isNoKey = e && typeof e === 'object' && 'data' in e && (e as { data?: { code?: string } }).data?.code === 'PRECONDITION_FAILED';
			error = isNoKey ? 'NO_KEY' : (e instanceof Error ? e.message : 'Error sending message.');
			messages = messages.slice(0, -1);
		} finally {
			loading = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			send();
		}
	}

	function clearConversation() {
		localStorage.removeItem(CONV_KEY);
		conversationId = undefined;
		messages = [];
		error = '';
	}
</script>

<div class="flex h-full flex-col border-l border-paper-border bg-paper dark:border-dark-paper-border dark:bg-dark-paper">
	<!-- Header -->
	<div class="flex items-center justify-between border-b border-paper-border px-4 py-3 dark:border-dark-paper-border">
		<div class="flex items-center gap-2">
			<div class="flex h-6 w-6 items-center justify-center rounded-full bg-accent/10 text-accent">
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
			</div>
			<span class="font-sans text-sm font-medium text-ink dark:text-dark-ink">Scholio Assistant</span>
		</div>
		<div class="flex items-center gap-2">
			{#if messages.length > 0}
				<button
					type="button"
					onclick={clearConversation}
					title="Clear conversation"
					class="font-sans text-[11px] text-ink-faint transition-colors hover:text-ink-muted dark:text-dark-ink-faint dark:hover:text-dark-ink-muted"
				>
					Clear
				</button>
			{/if}
			{#if !orgId}
				<select
					bind:value={selectedModel}
					class="rounded border border-paper-border bg-transparent px-1.5 py-0.5 font-sans text-[11px] text-ink-faint focus:outline-none dark:border-dark-paper-border dark:text-dark-ink-faint"
					title="Model for this session"
				>
					<option value="">— model —</option>
					{#each toolCallingModels as m (m.id)}
						<option value={m.id}>{m.shortLabel}</option>
					{/each}
				</select>
			{/if}
			<button
				type="button"
				onclick={onClose}
				class="text-ink-faint transition-colors hover:text-ink-muted dark:text-dark-ink-faint dark:hover:text-dark-ink-muted"
				aria-label="Close assistant"
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
				</svg>
			</button>
		</div>
	</div>

	<!-- Messages -->
	<div bind:this={messagesEl} class="flex-1 overflow-y-auto px-4 py-4">
		{#if !historyLoaded}
			<div class="flex h-full items-center justify-center">
				<div class="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
			</div>
		{:else if messages.length === 0}
			<!-- Empty state + shortcuts -->
			<div class="flex h-full flex-col justify-between">
				<div class="flex flex-col items-center gap-2 pt-6 text-center">
					<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
						Ask anything about your project.
					</p>
					<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
						The assistant can read your documents, references, and requirements.
					</p>
				</div>
				<div class="flex flex-col gap-1.5 pb-2">
					<p class="mb-1 font-sans text-[11px] font-medium tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint">
						Quick questions
					</p>
					{#each SHORTCUTS as s}
						<button
							type="button"
							onclick={() => useShortcut(s.prompt)}
							class="rounded-lg border border-paper-border px-3 py-2 text-left font-sans text-xs text-ink-muted transition-colors hover:border-accent/40 hover:text-ink dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:text-dark-ink"
						>
							{s.label}
						</button>
					{/each}
				</div>
			</div>
		{:else}
			<div class="flex flex-col gap-5">
				{#each messages as msg}
					{#if msg.role === 'user'}
						<div class="flex justify-end">
							<div class="max-w-[85%] rounded-2xl rounded-tr-sm bg-accent px-4 py-2.5 font-sans text-sm leading-relaxed text-white">
								{msg.content}
							</div>
						</div>
					{:else}
						<div class="flex flex-col gap-1.5">
							<div class="rounded-2xl rounded-tl-sm bg-paper-ui px-4 py-3 font-sans text-sm leading-relaxed text-ink dark:bg-dark-paper-ui dark:text-dark-ink" style="white-space: pre-wrap;">
								{msg.content}
							</div>
							{#if msg.docsUsed && msg.docsUsed.length > 0}
								<div class="flex flex-wrap gap-1 pl-1">
									{#each msg.docsUsed as doc}
										<span class="rounded-full bg-accent/8 px-2 py-0.5 font-sans text-[10px] text-accent dark:bg-accent/12">
											{doc.title}
										</span>
									{/each}
								</div>
							{/if}
						</div>
					{/if}
				{/each}
				{#if loading}
					<div class="flex items-center gap-2 pl-1">
						<div class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
						<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">Thinking…</span>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	{#if error}
		<div class="mx-4 mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-xs text-red-600 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-400">
			{#if error === 'NO_KEY'}
				No AI key configured. <a href="/settings?tab=ai" class="underline underline-offset-2 hover:opacity-80">Go to Settings → AI</a> to add one.
			{:else}
				{error}
			{/if}
		</div>
	{/if}

	<!-- Input -->
	<div class="border-t border-paper-border px-3 pt-2.5 pb-3 dark:border-dark-paper-border">
		<div class="flex items-end gap-2 rounded-xl border border-paper-border bg-paper-ui px-3 py-2 focus-within:border-accent dark:border-dark-paper-border dark:bg-dark-paper-ui">
			<textarea
				bind:value={input}
				onkeydown={handleKeydown}
				placeholder="Ask a question… (⌘↵ to send)"
				rows="2"
				class="flex-1 resize-none bg-transparent font-sans text-sm text-ink placeholder:text-ink-faint focus:outline-none dark:text-dark-ink"
				style="max-height: 120px;"
			></textarea>
			<button
				type="button"
				onclick={send}
				disabled={!input.trim() || loading}
				class="shrink-0 rounded-lg bg-accent p-1.5 text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
				aria-label="Send"
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
			</button>
		</div>
	</div>
</div>
