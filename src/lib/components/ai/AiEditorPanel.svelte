<script lang="ts">
	import { trpc } from '$lib/utils/trpc';
	import { tick, onMount, untrack } from 'svelte';
	type ResolvedModel = { id: string; shortLabel: string; toolCalling: boolean };
	import EditorActionCard from '$lib/components/ai/EditorActionCard.svelte';
	import ReferenceSelectCard from '$lib/components/ai/ReferenceSelectCard.svelte';
	import SafeDeleteDialog from '$lib/components/ui/SafeDeleteDialog.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import type { PendingEditorAction, PendingAction } from '$lib/server/trpc/routers/ai';

	import { resolve } from '$app/paths';
	type Props = {
		projectId: string;
		documentId: string;
		documentTitle: string;
		getDocumentContent: () => string;
		spellLanguage?: string;
		onApplyEdit: (action: PendingEditorAction) => void;
		onClose: () => void;
		orgId?: string | null;
		defaultModel?: string;
	};

	let {
		projectId,
		documentId,
		documentTitle,
		getDocumentContent,
		spellLanguage = 'auto',
		onApplyEdit,
		onClose,
		orgId = null,
		defaultModel = ''
	}: Props = $props();

	let toolCallingModels = $state<ResolvedModel[]>([]);
	let selectedModel = $state(untrack(() => defaultModel));

	type Message = {
		role: 'user' | 'assistant' | 'system';
		content: string;
		docsUsed?: { id: string; title: string }[];
		broken?: boolean;
	};

	const CONV_KEY = untrack(() => `ai-editor-conv-${documentId}`);

	const SHORTCUTS = [
		{
			label: 'Improve clarity',
			prompt: 'Review this document and suggest what could be made clearer or more concise.'
		},
		{
			label: 'Check argument flow',
			prompt: 'Does the argument flow logically from section to section? Where are the weak points?'
		},
		{ label: 'Strengthen conclusion', prompt: 'Make the conclusion more direct and impactful.' },
		{
			label: 'Academic tone',
			prompt: 'Identify any passages where the tone is too informal or imprecise.'
		}
	];

	const TOOL_LABELS: Record<string, string> = {
		get_project_context: 'Reading project context…',
		read_document: 'Reading document…',
		search_documents_semantic: 'Searching documents…',
		list_references: 'Loading bibliography…',
		get_requirement_details: 'Reading requirements…',
		list_issues: 'Loading issues…',
		check_spelling: 'Running spell check…',
		check_grammar: 'Running grammar check…',
		find_untagged: 'Scanning for untagged items…',
		replace_text: 'Preparing edit…',
		insert_after: 'Preparing insertion…',
		insert_index: 'Preparing index…',
		set_diagram_code: 'Drawing diagram…',
		propose_references: 'Searching bibliography…'
	};

	let messages = $state<Message[]>([]);
	let conversationId = $state<string | undefined>(undefined);
	let input = $state('');
	let retryText = $state<string | null>(null);
	let loading = $state(false);
	let loadingHint = $state('Thinking…');
	let error = $state('');
	let abortController = $state<AbortController | null>(null);

	function stopStream() {
		abortController?.abort();
	}
	let historyLoaded = $state(false);
	let messagesEl = $state<HTMLDivElement | null>(null);

	onMount(() => {
		fetch(`/api/projects/${projectId}/warm-index`, { method: 'POST' }).catch(() => {});
		trpc.aiConfig.getModels
			.query()
			.then((models) => {
				toolCallingModels = (models as ResolvedModel[]).filter((m) => m.toolCalling);
			})
			.catch(() => {});
	});

	let showClearDialog = $state(false);

	// Pending editor actions from the last assistant message
	let pendingEditorActions = $state<PendingEditorAction[]>([]);
	let pendingActions = $state<PendingAction[]>([]);

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
			historyLoaded = true;
			await scrollToBottom();
		} catch {
			localStorage.removeItem(CONV_KEY);
			conversationId = undefined;
			historyLoaded = true;
		}
	}

	function useShortcut(prompt: string) {
		input = prompt;
	}

	async function send(overrideText?: string) {
		const text = (overrideText ?? input).trim();
		if (!text || loading) return;

		retryText = null;
		messages = messages.filter((m) => !m.broken);
		messages = [...messages, { role: 'user', content: text }];
		if (!overrideText) input = '';
		loading = true;
		loadingHint = 'Thinking…';
		error = '';
		pendingEditorActions = [];
		pendingActions = [];
		await scrollToBottom();

		// Streaming assistant message placeholder
		let assistantIdx = -1;
		const controller = new AbortController();
		abortController = controller;

		try {
			const res = await fetch(`/api/projects/${projectId}/documents/${documentId}/chat`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					projectId,
					documentTitle,
					documentContent: getDocumentContent(),
					spellLanguage,
					conversationId,
					message: text,
					...(!orgId && selectedModel ? { modelOverride: selectedModel } : {})
				}),
				signal: controller.signal
			});

			if (!res.ok || !res.body) {
				const errText = await res.text().catch(() => 'Request failed');
				throw new Error(errText);
			}

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buf = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buf += decoder.decode(value, { stream: true });
				const lines = buf.split('\n');
				buf = lines.pop() ?? '';

				for (const line of lines) {
					if (!line.startsWith('data: ')) continue;
					const raw = line.slice(6).trim();
					let evt: Record<string, unknown>;
					try {
						evt = JSON.parse(raw);
					} catch {
						continue;
					}

					if (evt.type === 'tool_start') {
						loadingHint = TOOL_LABELS[evt.name as string] ?? `Calling ${evt.name}…`;
					} else if (evt.type === 'text_delta') {
						if (assistantIdx === -1) {
							messages = [...messages, { role: 'assistant', content: evt.content as string }];
							assistantIdx = messages.length - 1;
							await scrollToBottom();
						} else {
							messages = messages.map((m, i) =>
								i === assistantIdx ? { ...m, content: m.content + (evt.content as string) } : m
							);
						}
					} else if (evt.type === 'done') {
						conversationId = evt.conversationId as string;
						localStorage.setItem(CONV_KEY, conversationId);
						if (Array.isArray(evt.pendingEditorActions) && evt.pendingEditorActions.length) {
							pendingEditorActions = evt.pendingEditorActions as PendingEditorAction[];
						}
						if (Array.isArray(evt.pendingActions) && evt.pendingActions.length) {
							pendingActions = evt.pendingActions as PendingAction[];
						}
						await scrollToBottom();
					} else if (evt.type === 'error') {
						const kind = evt.kind as string;
						const msg = evt.message as string;
						if (kind === 'system') {
							if (assistantIdx === -1) {
								messages = messages.slice(0, -1);
							} else {
								messages = messages.filter((_, i) => i !== assistantIdx);
							}
							messages = [...messages, { role: 'system', content: msg }];
							assistantIdx = -1;
							await scrollToBottom();
						} else if (assistantIdx !== -1) {
							messages = messages.map((m, i) => (i === assistantIdx ? { ...m, broken: true } : m));
							retryText = text;
						} else {
							error = msg;
						}
					}
				}
			}

			// If model returned nothing (e.g. only tool calls, no text) — ensure message exists
			if (assistantIdx === -1) {
				// no-op: done event handled it
			}
		} catch (e: unknown) {
			if (e instanceof Error && e.name === 'AbortError') {
				// User stopped — keep whatever was streamed
			} else if (assistantIdx !== -1) {
				messages = messages.map((m, i) => (i === assistantIdx ? { ...m, broken: true } : m));
				retryText = text;
			} else {
				messages = messages.slice(0, -1);
				error = e instanceof Error ? e.message : 'Request failed';
			}
		} finally {
			abortController = null;
			loading = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			send();
		}
	}

	async function retry() {
		if (!retryText) return;
		const text = retryText;
		retryText = null;
		const brokenIdx = messages.findIndex((m) => m.broken);
		if (brokenIdx !== -1) {
			messages = messages.filter((_, i) => i !== brokenIdx && i !== brokenIdx - 1);
		}
		await send(text);
	}

	function clearConversation() {
		localStorage.removeItem(CONV_KEY);
		conversationId = undefined;
		messages = [];
		pendingEditorActions = [];
		pendingActions = [];
		error = '';
		showClearDialog = false;
	}
</script>

<div
	class="flex h-full flex-col border-l border-paper-border bg-paper dark:border-dark-paper-border dark:bg-dark-paper"
>
	<!-- Header -->
	<div
		class="flex items-center justify-between border-b border-paper-border px-4 py-3 dark:border-dark-paper-border"
	>
		<div class="flex items-center gap-2">
			<div class="flex h-6 w-6 items-center justify-center rounded-full bg-accent/10 text-accent">
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</div>
			<span class="font-sans text-sm font-medium text-ink dark:text-dark-ink"
				>Scholio Assistant</span
			>
		</div>
		<div class="flex items-center gap-2">
			{#if messages.length > 0}
				<button
					type="button"
					onclick={() => (showClearDialog = true)}
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

	<!-- Messages -->
	<div bind:this={messagesEl} class="flex-1 overflow-y-auto px-4 py-4">
		{#if !historyLoaded}
			<div class="flex h-full items-center justify-center">
				<Spinner class="text-accent" />
			</div>
		{:else if messages.length === 0}
			<!-- Empty state + shortcuts -->
			<div class="flex flex-col gap-4 pt-4">
				<div class="flex flex-col items-center gap-2 text-center">
					<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
						Ask anything about your project.
					</p>
					<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
						The assistant can read your documents, references, and requirements.
					</p>
					<div class="mt-1 flex flex-wrap justify-center gap-1.5">
						<span
							class="rounded-full bg-accent/10 px-2.5 py-1 font-sans text-[11px] text-accent/80 dark:bg-accent/15 dark:text-accent/70"
							>Propone edits inline</span
						>
						<span
							class="rounded-full bg-accent/10 px-2.5 py-1 font-sans text-[11px] text-accent/80 dark:bg-accent/15 dark:text-accent/70"
							>Lee tus referencias</span
						>
						<span
							class="rounded-full bg-accent/10 px-2.5 py-1 font-sans text-[11px] text-accent/80 dark:bg-accent/15 dark:text-accent/70"
							>Mejora el estilo</span
						>
					</div>
				</div>
				<div class="flex flex-col gap-1.5">
					<p
						class="mb-1 font-sans text-[11px] font-medium tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint"
					>
						Quick questions
					</p>
					{#each SHORTCUTS as s, i (i)}
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
				{#each messages as msg, i (i)}
					{#if msg.role === 'system'}
						<div class="flex items-center gap-2">
							<div class="h-px flex-1 bg-paper-border dark:bg-dark-paper-border"></div>
							<span class="font-sans text-[11px] text-ink-faint dark:text-dark-ink-faint"
								>{msg.content}</span
							>
							<div class="h-px flex-1 bg-paper-border dark:bg-dark-paper-border"></div>
						</div>
					{:else if msg.role === 'user'}
						<div class="flex justify-end">
							<div
								class="max-w-[85%] rounded-2xl rounded-tr-sm bg-accent px-4 py-2.5 font-sans text-sm leading-relaxed text-white"
							>
								{msg.content}
							</div>
						</div>
					{:else}
						<div class="flex flex-col gap-1.5">
							<div
								class="rounded-2xl rounded-tl-sm bg-paper-ui px-4 py-3 font-sans text-sm leading-relaxed text-ink dark:bg-dark-paper-ui dark:text-dark-ink {msg.broken
									? 'opacity-50'
									: ''}"
								style="white-space: pre-wrap;"
							>
								{msg.content}
							</div>
							{#if msg.broken}
								<div class="flex items-center gap-2 pl-1">
									<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint"
										>Response interrupted</span
									>
									<button
										type="button"
										onclick={retry}
										class="font-sans text-xs text-accent underline decoration-dotted hover:decoration-solid"
										>Retry</button
									>
								</div>
							{:else if msg.docsUsed && msg.docsUsed.length > 0}
								<div class="flex flex-wrap gap-1 pl-1">
									{#each msg.docsUsed as doc (doc.id)}
										<span
											class="rounded-full bg-accent/8 px-2 py-0.5 font-sans text-[10px] text-accent dark:bg-accent/12"
										>
											{doc.title}
										</span>
									{/each}
								</div>
							{/if}
							<!-- Editor action cards — shown only after the last assistant message -->
							{#if i === messages.length - 1 && pendingEditorActions.length > 0 && !msg.broken}
								{#each pendingEditorActions as action, j (j)}
									<EditorActionCard
										{action}
										onconfirm={(a) => {
											onApplyEdit(a);
											pendingEditorActions = pendingEditorActions.filter((_, idx) => idx !== j);
										}}
										ondiscard={() => {
											pendingEditorActions = pendingEditorActions.filter((_, idx) => idx !== j);
										}}
									/>
								{/each}
							{/if}
							{#if i === messages.length - 1 && pendingActions.length > 0 && !msg.broken}
								{#each pendingActions as action, j (j)}
									{#if action.type === 'propose_references'}
										<ReferenceSelectCard
											references={action.references}
											{projectId}
											onconfirm={(count) => {
												pendingActions = pendingActions.filter((_, idx) => idx !== j);
												messages = [
													...messages,
													{
														role: 'system',
														content: `${count} ${count === 1 ? 'reference' : 'references'} added to bibliography`
													}
												];
											}}
											ondiscard={() => {
												pendingActions = pendingActions.filter((_, idx) => idx !== j);
											}}
										/>
									{/if}
								{/each}
							{/if}
						</div>
					{/if}
				{/each}
				{#if loading}
					<div class="flex items-center gap-2 pl-1">
						<Spinner size="sm" class="text-accent" />
						<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint"
							>{loadingHint}</span
						>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	{#if error}
		<div
			class="mx-4 mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-xs text-red-600 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-400"
		>
			{#if error === 'NO_KEY'}
				No AI key configured. <a
					href={resolve('/settings?tab=ai')}
					class="underline underline-offset-2 hover:opacity-80">Go to Settings → AI</a
				> to add one.
			{:else}
				{error}
			{/if}
		</div>
	{/if}

	<!-- Input -->
	<div class="border-t border-paper-border px-3 pt-2.5 pb-3 dark:border-dark-paper-border">
		<div
			class="flex items-end gap-2 rounded-xl border border-paper-border bg-paper-ui px-3 py-2 focus-within:border-accent dark:border-dark-paper-border dark:bg-dark-paper-ui"
		>
			<textarea
				bind:value={input}
				onkeydown={handleKeydown}
				placeholder="Ask a question… (↵ to send, ⇧↵ for new line)"
				rows="2"
				class="flex-1 resize-none bg-transparent font-sans text-sm text-ink placeholder:text-ink-faint focus:outline-none dark:text-dark-ink"
				style="max-height: 120px;"
			></textarea>
			{#if loading}
				<button
					type="button"
					onclick={stopStream}
					aria-label="Stop"
					class="shrink-0 rounded-lg border border-paper-border bg-paper p-1.5 text-ink-muted transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-500 dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink-muted dark:hover:border-red-700/50 dark:hover:bg-red-950/30 dark:hover:text-red-400"
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
						<rect x="5" y="5" width="14" height="14" rx="2" />
					</svg>
				</button>
			{:else}
				<button
					type="button"
					onclick={() => send()}
					disabled={!input.trim()}
					class="shrink-0 rounded-lg bg-accent p-1.5 text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
					aria-label="Send"
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path
							d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</button>
			{/if}
		</div>
	</div>
</div>

<SafeDeleteDialog
	open={showClearDialog}
	title="Clear conversation"
	label="this conversation"
	warning="All messages in this conversation will be deleted. This cannot be undone."
	confirmLabel="Clear"
	requireCode={false}
	onconfirm={clearConversation}
	oncancel={() => (showClearDialog = false)}
/>
