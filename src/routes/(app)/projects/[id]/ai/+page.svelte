<script lang="ts">
	import { untrack } from 'svelte';
	import { marked } from 'marked';
	import DOMPurify from 'dompurify';
	import { trpc } from '$lib/utils/trpc';
	import ActionCard from '$lib/components/ai/ActionCard.svelte';
	import ReferenceSelectCard from '$lib/components/ai/ReferenceSelectCard.svelte';
	import type { PendingAction } from '$lib/server/trpc/routers/ai';
	import { classifyAiError } from '$lib/utils/ai-errors';
	import type { PageData } from './$types';
	import SafeDeleteDialog from '$lib/components/ui/SafeDeleteDialog.svelte';
	import { MODELS, MODEL_RECOMMENDATIONS } from '$lib/ai-config';

	let { data }: { data: PageData } = $props();

	type Message = { id: string; role: 'user' | 'assistant' | 'system'; content: string; docsUsed?: { id: string; title: string }[] };
	type Conversation = NonNullable<typeof data.conversations>[number];

	let conversations = $state<Conversation[]>([]);
	$effect(() => { conversations = data.conversations ?? []; });
	let activeConvId = $state<string | null>(null);
	let messages = $state<Message[]>([]);
	let loadingConv = $state(false);

	let input = $state('');
	let sending = $state(false);
	let sendError = $state<string | null>(null);

	// Pending actions from the latest agent response (in-memory, cleared on next send)
	let pendingActions = $state<PendingAction[]>([]);
	let lastAssistantMsgId = $state<string | null>(null);

	// Cycle through status hints while the agent loop runs
	const thinkingHints = [
		'Consultando el proyecto…',
		'Leyendo documentos…',
		'Analizando el contenido…',
		'Preparando la respuesta…'
	];
	let thinkingIndex = $state(0);
	let thinkingInterval: ReturnType<typeof setInterval> | undefined;

	function startThinking() {
		thinkingIndex = 0;
		thinkingInterval = setInterval(() => {
			thinkingIndex = (thinkingIndex + 1) % thinkingHints.length;
		}, 1800);
	}
	function stopThinking() {
		clearInterval(thinkingInterval);
		thinkingInterval = undefined;
	}

	let messagesEnd = $state<HTMLDivElement | undefined>(undefined);

	async function selectConversation(conv: Conversation) {
		if (loadingConv) return;
		loadingConv = true;
		try {
			const result = await trpc.ai.getConversation.query(conv.id);
			activeConvId = conv.id;
			messages = result.messages as Message[];
			scrollToBottom();
		} finally {
			loadingConv = false;
		}
	}

	function newConversation() {
		activeConvId = null;
		messages = [];
		input = '';
	}

	async function send() {
		const text = input.trim();
		if (!text || sending) return;

		input = '';
		sending = true;
		sendError = null;
		pendingActions = [];
		lastAssistantMsgId = null;
		startThinking();

		// Optimistic user message
		const tempId = crypto.randomUUID();
		messages = [...messages, { id: tempId, role: 'user', content: text }];
		scrollToBottom();

		try {
			const result = await trpc.ai.sendMessage.mutate({
				projectId: data.project.id,
				conversationId: activeConvId ?? undefined,
				message: text,
				modelOverride: modelOverride ?? undefined
			});

			activeConvId = result.conversationId;
			messages = [...messages, result.message];
			if (result.pendingActions?.length) {
				pendingActions = result.pendingActions;
				lastAssistantMsgId = result.message.id;
			}

			// Update sidebar conversation list
			const existing = conversations.find((c) => c.id === result.conversationId);
			if (!existing) {
				const conv = await trpc.ai.listConversations.query(data.project.id);
				conversations = conv ?? [];
			} else {
				conversations = conversations.map((c) =>
					c.id === result.conversationId ? { ...c, updatedAt: new Date() } : c
				);
			}

			scrollToBottom();
		} catch (e) {
			messages = messages.filter((m) => m.id !== tempId);
			const { kind, message: errMsg } = classifyAiError(e);
			if (kind === 'system') {
				messages = [...messages, { id: crypto.randomUUID(), role: 'system', content: errMsg }];
				scrollToBottom();
			} else {
				sendError = errMsg;
			}
		} finally {
			stopThinking();
			sending = false;
		}
	}

	let convToDelete = $state<string | null>(null);
	let deletingConv = $state(false);

	function requestDeleteConversation(id: string, e: MouseEvent) {
		e.stopPropagation();
		convToDelete = id;
	}

	async function confirmDeleteConversation() {
		if (!convToDelete) return;
		deletingConv = true;
		try {
			await trpc.ai.deleteConversation.mutate(convToDelete);
			conversations = conversations.filter((c) => c.id !== convToDelete);
			if (activeConvId === convToDelete) newConversation();
		} finally {
			deletingConv = false;
			convToDelete = null;
		}
	}

	function scrollToBottom() {
		// Wait for DOM update
		setTimeout(() => messagesEnd?.scrollIntoView({ behavior: 'smooth' }), 50);
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			send();
		}
	}

	function formatDate(date: Date | string) {
		return new Date(date).toLocaleDateString('es', { day: 'numeric', month: 'short' });
	}

	// ── Agent model selector ─────────────────────────────────────────────────
	// Models available for the agent task: must support tool calling
	const agentModels = MODELS.filter((m) => m.toolCalling && (MODEL_RECOMMENDATIONS[m.id]?.includes('agent') ?? true));

	// Configured model (from user Settings) — used as default
	let configuredModel = $state<string>('anthropic/claude-sonnet-4-6');
	// Per-conversation override chosen in this session
	let modelOverride = $state<string | null>(null);

	const activeModel = $derived(modelOverride ?? configuredModel);
	const activeModelLabel = $derived(MODELS.find((m) => m.id === activeModel)?.shortLabel ?? activeModel);
	const isOverridden = $derived(modelOverride !== null && modelOverride !== configuredModel);

	let showModelPicker = $state(false);

	async function loadAiConfig() {
		try {
			const taskData = await trpc.aiConfig.getTaskConfig.query();
			const agentCfg = (taskData.taskConfig as Record<string, { keyId: string; model: string }>)['agent'];
			if (agentCfg?.model) configuredModel = agentCfg.model;
		} catch {
			// non-critical
		}
	}

	$effect(() => {
		loadAiConfig();
	});

	// ── Agent system prompt editor ────────────────────────────────────────────
	let promptText = $state(untrack(() => data.project.agentSystemPrompt ?? ''));
	let promptSaving = $state(false);
	let promptSaved = $state(false);
	let showPromptEditor = $state(false);

	async function savePrompt() {
		promptSaving = true;
		promptSaved = false;
		try {
			await trpc.projects.updateAgentPrompt.mutate({
				projectId: data.project.id,
				agentSystemPrompt: promptText.trim() || null
			});
			promptSaved = true;
			setTimeout(() => { promptSaved = false; }, 2000);
		} finally {
			promptSaving = false;
		}
	}

	// ── Markdown rendering ────────────────────────────────────────────────────
	function renderMd(text: string): string {
		const raw = marked.parse(text) as string;
		return typeof DOMPurify.sanitize === 'function' ? DOMPurify.sanitize(raw) : raw;
	}

	// ── Privacy onboarding ────────────────────────────────────────────────────
	const PRIVACY_KEY = 'scholio_ai_privacy_seen';
	let showPrivacyNotice = $state(
		typeof localStorage !== 'undefined' && !localStorage.getItem(PRIVACY_KEY)
	);

	function dismissPrivacyNotice() {
		localStorage.setItem(PRIVACY_KEY, '1');
		showPrivacyNotice = false;
	}
</script>

{#if data.project}
<div class="flex h-full overflow-hidden">
	<!-- Sidebar: conversation list -->
	<aside
		class="flex w-64 shrink-0 flex-col border-r border-paper-border bg-paper dark:border-dark-paper-border dark:bg-dark-paper"
	>
		<div class="flex items-center justify-between border-b border-paper-border px-4 py-3 dark:border-dark-paper-border">
			<a
				href="/projects/{data.project.id}"
				class="flex items-center gap-1.5 font-sans text-xs text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
			>
				<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
					<path d="M10 12L6 8l4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
				</svg>
				{data.project.title}
			</a>
			<button
				type="button"
				onclick={newConversation}
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
						class="group relative flex items-start transition-colors hover:bg-paper-ui dark:hover:bg-dark-paper-ui {activeConvId === conv.id ? 'bg-paper-ui dark:bg-dark-paper-ui' : ''}"
					>
						<button
							type="button"
							onclick={() => selectConversation(conv)}
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
							onclick={(e) => requestDeleteConversation(conv.id, e)}
							class="mr-2 mt-2.5 shrink-0 rounded p-0.5 text-ink-faint opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100 dark:text-dark-ink-faint"
						>
							<svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
							</svg>
						</button>
					</div>
				{/each}
			{/if}
		</div>

		{#if data.isOwner}
			<div class="shrink-0 border-t border-paper-border dark:border-dark-paper-border">
				<button
					type="button"
					onclick={() => (showPromptEditor = !showPromptEditor)}
					class="flex w-full items-center justify-between px-4 py-2.5 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-ui hover:text-ink dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui dark:hover:text-dark-ink"
				>
					<span class="flex items-center gap-1.5">
						<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" stroke-width="1.5"/>
							<path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" stroke-width="1.5"/>
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
						<path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				</button>
				{#if showPromptEditor}
					<div class="px-4 pb-4">
						<p class="mb-2 font-sans text-[11px] leading-relaxed text-ink-faint dark:text-dark-ink-faint">
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

	<!-- Main chat area -->
	<div class="flex flex-1 flex-col overflow-hidden">
		<!-- Messages -->
		<div class="flex-1 overflow-y-auto px-6 py-6">
			{#if messages.length === 0}
				<div class="flex h-full flex-col items-center justify-center gap-4 text-center">
					<div class="rounded-full bg-accent/10 p-4">
						<svg width="28" height="28" viewBox="0 0 24 24" fill="none" class="text-accent" aria-hidden="true">
							<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
						</svg>
					</div>
					<div>
						<p class="font-serif text-lg font-semibold text-ink dark:text-dark-ink">
							Research assistant
						</p>
						<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
							Hazme preguntas sobre el contenido de tu proyecto.
						</p>
						<p class="mt-0.5 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
							E.g. "What references to Mises are in the draft?"
						</p>
						<div class="mt-3 flex flex-wrap justify-center gap-1.5">
							<span class="rounded-full bg-accent/10 px-2.5 py-1 font-sans text-[11px] text-accent/80 dark:bg-accent/15 dark:text-accent/70">Busca en tus documentos</span>
							<span class="rounded-full bg-accent/10 px-2.5 py-1 font-sans text-[11px] text-accent/80 dark:bg-accent/15 dark:text-accent/70">Crea documentos</span>
							<span class="rounded-full bg-accent/10 px-2.5 py-1 font-sans text-[11px] text-accent/80 dark:bg-accent/15 dark:text-accent/70">Abre issues</span>
						</div>
					</div>
				</div>
			{:else}
				<div class="mx-auto flex max-w-2xl flex-col gap-6">
					{#each messages as msg (msg.id)}
						{#if msg.role === 'system'}
							<div class="flex items-center gap-3">
								<div class="h-px flex-1 bg-paper-border dark:bg-dark-paper-border"></div>
								<span class="font-sans text-[11px] text-ink-faint dark:text-dark-ink-faint">{msg.content}</span>
								<div class="h-px flex-1 bg-paper-border dark:bg-dark-paper-border"></div>
							</div>
						{:else}
						<div class="flex gap-3 {msg.role === 'user' ? 'flex-row-reverse' : ''}">
							<!-- Avatar -->
							<div
								class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold {msg.role === 'user' ? 'bg-accent text-white' : 'bg-paper-border text-ink-muted dark:bg-dark-paper-border dark:text-dark-ink-muted'}"
							>
								{msg.role === 'user' ? 'You' : 'AI'}
							</div>
							<!-- Bubble + pending actions for this message -->
							<div class="flex max-w-[80%] flex-col">
								<div
									class="rounded-2xl px-4 py-3 font-sans text-sm leading-relaxed {msg.role === 'user'
										? 'rounded-tr-sm bg-accent text-white'
										: 'chat-prose rounded-tl-sm bg-paper-ui text-ink dark:bg-dark-paper-ui dark:text-dark-ink'}"
								>
									{#if msg.role === 'assistant'}
										<!-- eslint-disable-next-line svelte/no-at-html-tags -->
										{@html renderMd(msg.content)}
									{:else}
										{msg.content}
									{/if}
								</div>
								{#if msg.role === 'assistant' && msg.docsUsed?.length}
								<div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 px-1">
									<span class="font-sans text-[11px] text-ink-faint dark:text-dark-ink-faint">Sources:</span>
									{#each msg.docsUsed as doc (doc.id)}
										<a
											href="/projects/{data.project.id}/documents/{doc.id}"
											class="font-sans text-[11px] text-ink-muted underline-offset-2 hover:text-ink hover:underline dark:text-dark-ink-muted dark:hover:text-dark-ink"
										>{doc.title}</a>
									{/each}
								</div>
							{/if}
							{#if msg.id === lastAssistantMsgId && pendingActions.length > 0}
									{#each pendingActions as action, i (i)}
										{#if action.type === 'propose_references'}
											<ReferenceSelectCard
												references={action.references}
												projectId={data.project.id}
												onconfirm={(count) => {
													pendingActions = pendingActions.filter((_, idx) => idx !== i);
													messages = [...messages, { id: crypto.randomUUID(), role: 'system', content: `${count} ${count === 1 ? 'reference' : 'references'} added to bibliography` }];
													scrollToBottom();
												}}
												ondiscard={() => {
													pendingActions = pendingActions.filter((_, idx) => idx !== i);
												}}
											/>
										{:else}
											<ActionCard
												{action}
												projectId={data.project.id}
												onconfirm={() => {
													const label = action.type === 'create_issue'
														? `Issue "${action.title}" created`
														: `Document "${action.title}" created`;
													pendingActions = pendingActions.filter((_, idx) => idx !== i);
													messages = [...messages, { id: crypto.randomUUID(), role: 'system', content: label }];
													scrollToBottom();
												}}
												ondiscard={() => {
													pendingActions = pendingActions.filter((_, idx) => idx !== i);
												}}
											/>
										{/if}
									{/each}
								{/if}
							</div>
						</div>
						{/if}
					{/each}

					{#if sending}
						<div class="flex gap-3">
							<div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-paper-border text-xs font-semibold text-ink-muted dark:bg-dark-paper-border dark:text-dark-ink-muted">
								AI
							</div>
							<div class="rounded-2xl rounded-tl-sm bg-paper-ui px-4 py-3 dark:bg-dark-paper-ui">
								<div class="flex items-center gap-2">
									<div class="flex gap-1">
										<span class="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint [animation-delay:0ms] dark:bg-dark-ink-faint"></span>
										<span class="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint [animation-delay:150ms] dark:bg-dark-ink-faint"></span>
										<span class="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint [animation-delay:300ms] dark:bg-dark-ink-faint"></span>
									</div>
									<span class="font-sans text-xs text-ink-faint transition-all dark:text-dark-ink-faint">
										{thinkingHints[thinkingIndex]}
									</span>
								</div>
							</div>
						</div>
					{/if}

					<div bind:this={messagesEnd}></div>
				</div>
			{/if}
		</div>

		<!-- Input -->
		<div class="border-t border-paper-border bg-paper px-6 py-4 dark:border-dark-paper-border dark:bg-dark-paper">
			{#if sendError}
				<div class="mx-auto mb-3 max-w-2xl flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/40 dark:bg-red-950/30">
					<p class="font-sans text-sm text-red-700 dark:text-red-400">{sendError}</p>
					<button
						type="button"
						onclick={() => (sendError = null)}
						aria-label="Cerrar"
						class="shrink-0 text-red-400 hover:text-red-600 dark:text-red-500"
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
						</svg>
					</button>
				</div>
			{/if}
			<div class="mx-auto max-w-2xl">
				<div class="flex items-end gap-3 rounded-xl border border-paper-border bg-paper-ui px-4 py-3 focus-within:border-accent dark:border-dark-paper-border dark:bg-dark-paper-ui">
					<textarea
						bind:value={input}
						onkeydown={onKeydown}
						placeholder="Ask about your project... (Enter to send, Shift+Enter for new line)"
						rows="1"
						class="flex-1 resize-none bg-transparent font-sans text-sm text-ink placeholder:text-ink-faint focus:outline-none dark:text-dark-ink"
						style="max-height: 160px; overflow-y: auto;"
					></textarea>
					<button
						type="button"
						onclick={send}
						disabled={sending || !input.trim()}
						aria-label="Enviar"
						class="shrink-0 rounded-lg bg-accent p-2 text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
					>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
						</svg>
					</button>
				</div>
				<div class="mt-2 flex items-center justify-between">
					<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
						El asistente tiene acceso al contenido de todos los documentos del proyecto.
					</p>
					<!-- Model picker trigger -->
					<div class="relative">
						<button
							type="button"
							onclick={() => (showModelPicker = !showModelPicker)}
							class="flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors hover:bg-paper-ui dark:hover:bg-dark-paper-ui {isOverridden ? 'border-accent/50 text-accent dark:border-accent/50' : 'border-paper-border text-ink-muted dark:border-dark-paper-border dark:text-dark-ink-muted'}"
						>
							<span class="font-sans text-[11px] text-ink-faint dark:text-dark-ink-faint">OpenRouter</span>
							<span class="text-ink-faint dark:text-dark-ink-faint">·</span>
							<span class="font-sans text-[11px]">{activeModelLabel}</span>
							{#if isOverridden}
								<span class="h-1.5 w-1.5 rounded-full bg-accent" title="Model override active"></span>
							{/if}
							<svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true" class="text-ink-faint dark:text-dark-ink-faint">
								<path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
						</button>

						{#if showModelPicker}
							<!-- Backdrop -->
							<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
							<div class="fixed inset-0 z-10" onclick={() => (showModelPicker = false)}></div>
							<!-- Popover -->
							<div class="absolute bottom-full right-0 z-20 mb-2 w-64 rounded-xl border border-paper-border bg-paper py-1.5 shadow-lg dark:border-dark-paper-border dark:bg-dark-paper">
								<p class="px-3 pb-1.5 pt-0.5 font-sans text-[11px] text-ink-faint dark:text-dark-ink-faint">
									Model for this session
								</p>
								{#each agentModels as m (m.id)}
									<button
										type="button"
										onclick={() => { modelOverride = m.id === configuredModel ? null : m.id; showModelPicker = false; }}
										class="flex w-full items-center justify-between px-3 py-2 text-left font-sans text-sm transition-colors hover:bg-paper-ui dark:hover:bg-dark-paper-ui {activeModel === m.id ? 'text-accent' : 'text-ink dark:text-dark-ink'}"
									>
										<span>{m.shortLabel}</span>
										{#if activeModel === m.id}
											<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
												<path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
											</svg>
										{/if}
									</button>
								{/each}
								{#if isOverridden}
									<div class="mx-3 mt-1 border-t border-paper-border pt-1 dark:border-dark-paper-border">
										<button
											type="button"
											onclick={() => { modelOverride = null; showModelPicker = false; }}
											class="w-full rounded py-1.5 font-sans text-xs text-ink-faint transition-colors hover:text-ink dark:text-dark-ink-faint dark:hover:text-dark-ink"
										>
											Reset to default ({MODELS.find((m) => m.id === configuredModel)?.shortLabel ?? configuredModel})
										</button>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
{/if}

{#if showPrivacyNotice}
	<!-- Privacy onboarding modal -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
		role="dialog"
		aria-modal="true"
		aria-labelledby="privacy-notice-title"
	>
		<div class="w-full max-w-md rounded-2xl border border-paper-border bg-paper p-6 shadow-xl dark:border-dark-paper-border dark:bg-dark-paper">
			<div class="flex items-start gap-3">
				<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-950">
					<svg class="h-5 w-5 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
					</svg>
				</div>
				<div>
					<h2 id="privacy-notice-title" class="font-serif text-base font-semibold text-ink dark:text-dark-ink">
						Tus documentos son privados
					</h2>
					<p class="mt-2 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
						When you use the AI assistant, the content of your documents is sent to OpenRouter <strong class="font-medium text-ink dark:text-dark-ink">only to process your query</strong>.
					</p>
					<p class="mt-2 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
						None of these providers use data sent via API to train their models. Your research stays within the query.
					</p>
					<p class="mt-2 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
						You can review the privacy policy at
						<a href="https://openrouter.ai/privacy" target="_blank" rel="noopener noreferrer" class="text-accent underline underline-offset-2">OpenRouter</a>.
					</p>
				</div>
			</div>
			<div class="mt-5 flex justify-end">
				<button
					onclick={dismissPrivacyNotice}
					class="rounded-lg bg-accent px-5 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover"
				>
					Entendido
				</button>
			</div>
		</div>
	</div>
{/if}

<SafeDeleteDialog
	open={!!convToDelete}
	label="this conversation"
	warning="All messages in this conversation will be permanently deleted."
	deleting={deletingConv}
	onconfirm={confirmDeleteConversation}
	oncancel={() => (convToDelete = null)}
/>

<style>
	/* Prose styles scoped to assistant chat bubbles */
	:global(.chat-prose p) { margin: 0.4em 0; }
	:global(.chat-prose p:first-child) { margin-top: 0; }
	:global(.chat-prose p:last-child) { margin-bottom: 0; }
	:global(.chat-prose ul, .chat-prose ol) { padding-left: 1.25em; margin: 0.4em 0; }
	:global(.chat-prose li) { margin: 0.15em 0; }
	:global(.chat-prose h1, .chat-prose h2, .chat-prose h3) {
		font-family: var(--font-serif, serif);
		font-weight: 600;
		margin: 0.75em 0 0.25em;
		line-height: 1.3;
	}
	:global(.chat-prose h1) { font-size: 1.1em; }
	:global(.chat-prose h2) { font-size: 1.05em; }
	:global(.chat-prose h3) { font-size: 1em; }
	:global(.chat-prose code) {
		font-family: ui-monospace, monospace;
		font-size: 0.85em;
		background: rgba(0,0,0,0.06);
		border-radius: 3px;
		padding: 0.1em 0.3em;
	}
	:global(.chat-prose pre) {
		background: rgba(0,0,0,0.06);
		border-radius: 6px;
		padding: 0.75em 1em;
		overflow-x: auto;
		margin: 0.5em 0;
	}
	:global(.chat-prose pre code) { background: none; padding: 0; }
	:global(.chat-prose blockquote) {
		border-left: 3px solid currentColor;
		opacity: 0.7;
		margin: 0.4em 0;
		padding-left: 0.75em;
	}
	:global(.chat-prose strong) { font-weight: 600; }
	:global(.chat-prose em) { font-style: italic; }
	:global(.chat-prose a) { text-decoration: underline; text-underline-offset: 2px; }
	:global(.chat-prose hr) { border: none; border-top: 1px solid currentColor; opacity: 0.2; margin: 0.75em 0; }
</style>
