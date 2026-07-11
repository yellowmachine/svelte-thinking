<script lang="ts">
	import { onMount } from 'svelte';
	import { marked } from 'marked';
	import DOMPurify from 'dompurify';
	import { trpc } from '$lib/utils/trpc';
	import ActionCard from '$lib/components/ai/ActionCard.svelte';
	import ReferenceSelectCard from '$lib/components/ai/ReferenceSelectCard.svelte';
	import AiConversationSidebar from '$lib/components/ai/AiConversationSidebar.svelte';
	import AiPrivacyNotice from '$lib/components/ai/AiPrivacyNotice.svelte';
	import type { PendingAction } from '$lib/server/trpc/routers/ai';
	import type { PageData } from './$types';
	import SafeDeleteDialog from '$lib/components/ui/SafeDeleteDialog.svelte';
	import { MODEL_RECOMMENDATIONS, formatModelSlug } from '$lib/ai-config';

	import { resolve } from '$app/paths';
	let { data }: { data: PageData } = $props();

	type ResolvedModel = { id: string; familyKey: string; shortLabel: string; toolCalling: boolean };

	onMount(() => {
		fetch(`/api/projects/${data.project.id}/warm-index`, { method: 'POST' }).catch(() => {});
	});

	type Message = {
		id: string;
		role: 'user' | 'assistant' | 'system';
		content: string;
		docsUsed?: { id: string; title: string }[];
		broken?: boolean;
	};
	let conversations = $derived(data.conversations ?? []);
	let activeConvId = $state<string | null>(null);
	let messages = $state<Message[]>([]);
	let loadingConv = $state(false);

	let input = $state('');
	let sending = $state(false);
	let sendError = $state<string | null>(null);
	let retryText = $state<string | null>(null);
	let thinkingHint = $state('Thinking…');
	let streamingMsgId = $state<string | null>(null);
	let abortController = $state<AbortController | null>(null);

	function stopStream() {
		abortController?.abort();
	}

	// Pending actions from the latest agent response (in-memory, cleared on next send)
	let pendingActions = $state<PendingAction[]>([]);
	let lastAssistantMsgId = $state<string | null>(null);

	const TOOL_LABELS: Record<string, string> = {
		get_project_context: 'Reading project context…',
		read_document: 'Reading document…',
		search_documents_semantic: 'Searching documents…',
		list_references: 'Loading bibliography…',
		get_requirement_details: 'Reading requirements…',
		list_issues: 'Loading issues…',
		create_document: 'Preparing document…',
		create_issue: 'Preparing issue…',
		propose_references: 'Searching bibliography…'
	};

	let messagesEnd = $state<HTMLDivElement | undefined>(undefined);

	async function selectConversation(conv: { id: string }) {
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

	async function send(overrideText?: string) {
		const text = (overrideText ?? input).trim();
		if (!text || sending) return;

		retryText = null;
		messages = messages.filter((m) => !m.broken);
		if (!overrideText) input = '';
		sending = true;
		sendError = null;
		pendingActions = [];
		lastAssistantMsgId = null;
		thinkingHint = 'Thinking…';
		streamingMsgId = null;

		const tempUserId = crypto.randomUUID();
		messages = [...messages, { id: tempUserId, role: 'user', content: text }];
		scrollToBottom();

		let localStreamId: string | null = null;
		const controller = new AbortController();
		abortController = controller;

		try {
			const res = await fetch(`/api/projects/${data.project.id}/chat`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					message: text,
					conversationId: activeConvId ?? undefined,
					modelOverride: modelOverride ?? undefined
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
						thinkingHint = TOOL_LABELS[evt.name as string] ?? `Calling ${evt.name as string}…`;
					} else if (evt.type === 'text_delta') {
						if (!localStreamId) {
							localStreamId = crypto.randomUUID();
							streamingMsgId = localStreamId;
							messages = [
								...messages,
								{ id: localStreamId, role: 'assistant', content: evt.content as string }
							];
							scrollToBottom();
						} else {
							messages = messages.map((m) =>
								m.id === localStreamId ? { ...m, content: m.content + (evt.content as string) } : m
							);
						}
					} else if (evt.type === 'done') {
						activeConvId = evt.conversationId as string;
						const msgId = evt.messageId as string;
						const docsUsed = (evt.docsUsed as { id: string; title: string }[]) ?? [];

						if (localStreamId) {
							messages = messages.map((m) =>
								m.id === localStreamId
									? { ...m, id: msgId, docsUsed: docsUsed.length > 0 ? docsUsed : undefined }
									: m
							);
						} else {
							messages = [...messages, { id: msgId, role: 'assistant', content: '' }];
						}
						streamingMsgId = null;
						lastAssistantMsgId = msgId;

						if (Array.isArray(evt.pendingActions) && (evt.pendingActions as unknown[]).length) {
							pendingActions = evt.pendingActions as PendingAction[];
						}

						const existing = conversations.find((c) => c.id === activeConvId);
						if (!existing) {
							const conv = await trpc.ai.listConversations.query(data.project.id);
							conversations = conv ?? [];
						} else {
							conversations = conversations.map((c) =>
								c.id === activeConvId ? { ...c, updatedAt: new Date() } : c
							);
						}

						scrollToBottom();
					} else if (evt.type === 'error') {
						const kind = evt.kind as string;
						const msg = evt.message as string;
						if (kind === 'system') {
							messages = messages.filter((m) => m.id !== localStreamId && m.id !== tempUserId);
							streamingMsgId = null;
							messages = [...messages, { id: crypto.randomUUID(), role: 'system', content: msg }];
							scrollToBottom();
						} else if (localStreamId) {
							messages = messages.map((m) => (m.id === localStreamId ? { ...m, broken: true } : m));
							streamingMsgId = null;
							retryText = text;
						} else {
							messages = messages.filter((m) => m.id !== localStreamId && m.id !== tempUserId);
							streamingMsgId = null;
							sendError = msg;
						}
					}
				}
			}
		} catch (e) {
			if (e instanceof Error && e.name === 'AbortError') {
				// User stopped — keep whatever was streamed, just stop loading
			} else if (localStreamId) {
				messages = messages.map((m) => (m.id === localStreamId ? { ...m, broken: true } : m));
				streamingMsgId = null;
				retryText = text;
			} else {
				messages = messages.filter((m) => m.id !== localStreamId && m.id !== tempUserId);
				streamingMsgId = null;
				sendError = e instanceof Error ? e.message : 'Request failed';
			}
		} finally {
			abortController = null;
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

	// ── Agent model selector ─────────────────────────────────────────────────
	// Models available for the agent task: must support tool calling
	let agentModels = $state<ResolvedModel[]>([]);

	// Configured model (from user Settings) — used as default
	let configuredModel = $state<string>('');
	// Per-conversation override chosen in this session
	let modelOverride = $state<string | null>(null);

	const activeModel = $derived(modelOverride ?? configuredModel);
	const activeModelLabel = $derived(
		agentModels.find((m) => m.id === activeModel)?.shortLabel ?? formatModelSlug(activeModel)
	);
	const isOverridden = $derived(modelOverride !== null && modelOverride !== configuredModel);

	let showModelPicker = $state(false);

	async function loadAiConfig() {
		try {
			const [taskData, models] = await Promise.all([
				trpc.aiConfig.getTaskConfig.query(),
				trpc.aiConfig.getModels.query()
			]);
			agentModels = (models as ResolvedModel[]).filter(
				(m) => m.toolCalling && (MODEL_RECOMMENDATIONS[m.familyKey]?.includes('agent') ?? true)
			);
			const agentCfg = (taskData.taskConfig as Record<string, { keyId: string; model: string }>)[
				'agent'
			];
			configuredModel =
				agentCfg?.model ??
				(taskData.defaultModelIds as Record<string, string>)['agent'] ??
				configuredModel;
		} catch {
			// non-critical
		}
	}

	$effect(() => {
		loadAiConfig();
	});

	// ── Markdown rendering ────────────────────────────────────────────────────
	function renderMd(text: string): string {
		const raw = marked.parse(text) as string;
		return typeof DOMPurify.sanitize === 'function' ? DOMPurify.sanitize(raw) : raw;
	}
</script>

{#if data.project}
	<div class="flex h-full overflow-hidden">
		<!-- Sidebar: conversation list -->
		<AiConversationSidebar
			{conversations}
			{activeConvId}
			projectId={data.project.id}
			projectTitle={data.project.title}
			isOwner={data.isOwner}
			{loadingConv}
			agentSystemPrompt={data.project.agentSystemPrompt ?? null}
			onselect={selectConversation}
			onnew={newConversation}
			ondeleteconversation={requestDeleteConversation}
		/>

		<!-- Main chat area -->
		<div class="flex flex-1 flex-col overflow-hidden">
			<!-- Messages -->
			<div class="flex-1 overflow-y-auto px-6 py-6">
				{#if messages.length === 0}
					<div class="flex h-full flex-col items-center justify-center gap-4 text-center">
						<div class="rounded-full bg-accent/10 p-4">
							<svg
								width="28"
								height="28"
								viewBox="0 0 24 24"
								fill="none"
								class="text-accent"
								aria-hidden="true"
							>
								<path
									d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
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
								<span
									class="rounded-full bg-accent/10 px-2.5 py-1 font-sans text-[11px] text-accent/80 dark:bg-accent/15 dark:text-accent/70"
									>Busca en tus documentos</span
								>
								<span
									class="rounded-full bg-accent/10 px-2.5 py-1 font-sans text-[11px] text-accent/80 dark:bg-accent/15 dark:text-accent/70"
									>Crea documentos</span
								>
								<span
									class="rounded-full bg-accent/10 px-2.5 py-1 font-sans text-[11px] text-accent/80 dark:bg-accent/15 dark:text-accent/70"
									>Abre issues</span
								>
							</div>
						</div>
					</div>
				{:else}
					<div class="mx-auto flex max-w-2xl flex-col gap-6">
						{#each messages as msg (msg.id)}
							{#if msg.role === 'system'}
								<div class="flex items-center gap-3">
									<div class="h-px flex-1 bg-paper-border dark:bg-dark-paper-border"></div>
									<span class="font-sans text-[11px] text-ink-faint dark:text-dark-ink-faint"
										>{msg.content}</span
									>
									<div class="h-px flex-1 bg-paper-border dark:bg-dark-paper-border"></div>
								</div>
							{:else}
								<div class="flex gap-3 {msg.role === 'user' ? 'flex-row-reverse' : ''}">
									<!-- Avatar -->
									<div
										class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold {msg.role ===
										'user'
											? 'bg-accent text-white'
											: 'bg-paper-border text-ink-muted dark:bg-dark-paper-border dark:text-dark-ink-muted'}"
									>
										{msg.role === 'user' ? 'You' : 'AI'}
									</div>
									<!-- Bubble + pending actions for this message -->
									<div class="flex max-w-[80%] flex-col">
										<div
											translate="no"
											class="rounded-2xl px-4 py-3 font-sans text-sm leading-relaxed {msg.role ===
											'user'
												? 'rounded-tr-sm bg-accent text-white'
												: `chat-prose rounded-tl-sm bg-paper-ui text-ink dark:bg-dark-paper-ui dark:text-dark-ink${msg.broken ? ' opacity-50' : ''}`}"
										>
											{#if msg.role === 'assistant'}
												<!-- eslint-disable-next-line svelte/no-at-html-tags -->
												{@html renderMd(msg.content)}
											{:else}
												{msg.content}
											{/if}
										</div>
										{#if msg.broken}
											<div class="mt-1 flex items-center gap-2 px-1">
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
										{:else if msg.role === 'assistant' && msg.docsUsed?.length}
											<div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 px-1">
												<span class="font-sans text-[11px] text-ink-faint dark:text-dark-ink-faint"
													>Sources:</span
												>
												{#each msg.docsUsed as doc (doc.id)}
													<a
														translate="no"
														href={resolve(`/projects/${data.project.id}/documents/${doc.id}`)}
														class="font-sans text-[11px] text-ink-muted underline-offset-2 hover:text-ink hover:underline dark:text-dark-ink-muted dark:hover:text-dark-ink"
														>{doc.title}</a
													>
												{/each}
											</div>
										{/if}
										{#if msg.id === lastAssistantMsgId && pendingActions.length > 0 && !msg.broken}
											{#each pendingActions as action, i (i)}
												{#if action.type === 'propose_references'}
													<ReferenceSelectCard
														references={action.references}
														projectId={data.project.id}
														onconfirm={(count) => {
															pendingActions = pendingActions.filter((_, idx) => idx !== i);
															messages = [
																...messages,
																{
																	id: crypto.randomUUID(),
																	role: 'system',
																	content: `${count} ${count === 1 ? 'reference' : 'references'} added to bibliography`
																}
															];
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
															const label =
																action.type === 'create_issue'
																	? `Issue "${action.title}" created`
																	: `Document "${action.title}" created`;
															pendingActions = pendingActions.filter((_, idx) => idx !== i);
															messages = [
																...messages,
																{ id: crypto.randomUUID(), role: 'system', content: label }
															];
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

						{#if sending && !streamingMsgId}
							<div class="flex gap-3">
								<div
									class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-paper-border text-xs font-semibold text-ink-muted dark:bg-dark-paper-border dark:text-dark-ink-muted"
								>
									AI
								</div>
								<div class="rounded-2xl rounded-tl-sm bg-paper-ui px-4 py-3 dark:bg-dark-paper-ui">
									<div class="flex items-center gap-2">
										<div class="flex gap-1">
											<span
												class="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint [animation-delay:0ms] dark:bg-dark-ink-faint"
											></span>
											<span
												class="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint [animation-delay:150ms] dark:bg-dark-ink-faint"
											></span>
											<span
												class="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint [animation-delay:300ms] dark:bg-dark-ink-faint"
											></span>
										</div>
										<span
											class="font-sans text-xs text-ink-faint transition-all dark:text-dark-ink-faint"
										>
											{thinkingHint}
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
			<div
				class="border-t border-paper-border bg-paper px-6 py-4 dark:border-dark-paper-border dark:bg-dark-paper"
			>
				{#if sendError}
					<div
						class="mx-auto mb-3 flex max-w-2xl items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/40 dark:bg-red-950/30"
					>
						<p class="font-sans text-sm text-red-700 dark:text-red-400">{sendError}</p>
						<button
							type="button"
							onclick={() => (sendError = null)}
							aria-label="Cerrar"
							class="shrink-0 text-red-400 hover:text-red-600 dark:text-red-500"
						>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<path
									d="M18 6L6 18M6 6l12 12"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
								/>
							</svg>
						</button>
					</div>
				{/if}
				<div class="mx-auto max-w-2xl">
					<div
						class="flex items-end gap-3 rounded-xl border border-paper-border bg-paper-ui px-4 py-3 focus-within:border-accent dark:border-dark-paper-border dark:bg-dark-paper-ui"
					>
						<textarea
							bind:value={input}
							onkeydown={onKeydown}
							placeholder="Ask about your project... (Enter to send, Shift+Enter for new line)"
							rows="1"
							class="flex-1 resize-none bg-transparent font-sans text-sm text-ink placeholder:text-ink-faint focus:outline-none dark:text-dark-ink"
							style="max-height: 160px; overflow-y: auto;"
						></textarea>
						{#if sending}
							<button
								type="button"
								onclick={stopStream}
								aria-label="Detener"
								class="shrink-0 rounded-lg border border-paper-border bg-paper p-2 text-ink-muted transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-500 dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink-muted dark:hover:border-red-700/50 dark:hover:bg-red-950/30 dark:hover:text-red-400"
							>
								<svg
									width="16"
									height="16"
									viewBox="0 0 24 24"
									fill="currentColor"
									aria-hidden="true"
								>
									<rect x="5" y="5" width="14" height="14" rx="2" />
								</svg>
							</button>
						{:else}
							<button
								type="button"
								onclick={() => send()}
								disabled={!input.trim()}
								aria-label="Enviar"
								class="shrink-0 rounded-lg bg-accent p-2 text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
							>
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
					<div class="mt-2 flex items-center justify-between">
						<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
							El asistente tiene acceso al contenido de todos los documentos del proyecto.
						</p>
						<!-- Model picker trigger -->
						<div class="relative">
							<button
								type="button"
								onclick={() => (showModelPicker = !showModelPicker)}
								class="flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors hover:bg-paper-ui dark:hover:bg-dark-paper-ui {isOverridden
									? 'border-accent/50 text-accent dark:border-accent/50'
									: 'border-paper-border text-ink-muted dark:border-dark-paper-border dark:text-dark-ink-muted'}"
							>
								<span class="font-sans text-[11px] text-ink-faint dark:text-dark-ink-faint"
									>OpenRouter</span
								>
								<span class="text-ink-faint dark:text-dark-ink-faint">·</span>
								<span class="font-sans text-[11px]">{activeModelLabel}</span>
								{#if isOverridden}
									<span class="h-1.5 w-1.5 rounded-full bg-accent" title="Model override active"
									></span>
								{/if}
								<svg
									width="10"
									height="10"
									viewBox="0 0 24 24"
									fill="none"
									aria-hidden="true"
									class="text-ink-faint dark:text-dark-ink-faint"
								>
									<path
										d="M6 9l6 6 6-6"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							</button>

							{#if showModelPicker}
								<!-- Backdrop -->
								<div
									class="fixed inset-0 z-10"
									aria-hidden="true"
									onclick={() => (showModelPicker = false)}
								></div>
								<!-- Popover -->
								<div
									class="absolute right-0 bottom-full z-20 mb-2 w-64 rounded-xl border border-paper-border bg-paper py-1.5 shadow-lg dark:border-dark-paper-border dark:bg-dark-paper"
								>
									<p
										class="px-3 pt-0.5 pb-1.5 font-sans text-[11px] text-ink-faint dark:text-dark-ink-faint"
									>
										Model for this session
									</p>
									{#each agentModels as m (m.id)}
										<button
											type="button"
											onclick={() => {
												modelOverride = m.id === configuredModel ? null : m.id;
												showModelPicker = false;
											}}
											class="flex w-full items-center justify-between px-3 py-2 text-left font-sans text-sm transition-colors hover:bg-paper-ui dark:hover:bg-dark-paper-ui {activeModel ===
											m.id
												? 'text-accent'
												: 'text-ink dark:text-dark-ink'}"
										>
											<span>{m.shortLabel}</span>
											{#if activeModel === m.id}
												<svg
													width="13"
													height="13"
													viewBox="0 0 24 24"
													fill="none"
													aria-hidden="true"
												>
													<path
														d="M20 6L9 17l-5-5"
														stroke="currentColor"
														stroke-width="2"
														stroke-linecap="round"
														stroke-linejoin="round"
													/>
												</svg>
											{/if}
										</button>
									{/each}
									{#if isOverridden}
										<div
											class="mx-3 mt-1 border-t border-paper-border pt-1 dark:border-dark-paper-border"
										>
											<button
												type="button"
												onclick={() => {
													modelOverride = null;
													showModelPicker = false;
												}}
												class="w-full rounded py-1.5 font-sans text-xs text-ink-faint transition-colors hover:text-ink dark:text-dark-ink-faint dark:hover:text-dark-ink"
											>
												Reset to default ({agentModels.find((m) => m.id === configuredModel)
													?.shortLabel ?? formatModelSlug(configuredModel)})
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

<AiPrivacyNotice />

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
	:global(.chat-prose p) {
		margin: 0.4em 0;
	}
	:global(.chat-prose p:first-child) {
		margin-top: 0;
	}
	:global(.chat-prose p:last-child) {
		margin-bottom: 0;
	}
	:global(.chat-prose ul, .chat-prose ol) {
		padding-left: 1.25em;
		margin: 0.4em 0;
	}
	:global(.chat-prose li) {
		margin: 0.15em 0;
	}
	:global(.chat-prose h1, .chat-prose h2, .chat-prose h3) {
		font-family: var(--font-serif, serif);
		font-weight: 600;
		margin: 0.75em 0 0.25em;
		line-height: 1.3;
	}
	:global(.chat-prose h1) {
		font-size: 1.1em;
	}
	:global(.chat-prose h2) {
		font-size: 1.05em;
	}
	:global(.chat-prose h3) {
		font-size: 1em;
	}
	:global(.chat-prose code) {
		font-family: ui-monospace, monospace;
		font-size: 0.85em;
		background: rgba(0, 0, 0, 0.06);
		border-radius: 3px;
		padding: 0.1em 0.3em;
	}
	:global(.chat-prose pre) {
		background: rgba(0, 0, 0, 0.06);
		border-radius: 6px;
		padding: 0.75em 1em;
		overflow-x: auto;
		margin: 0.5em 0;
	}
	:global(.chat-prose pre code) {
		background: none;
		padding: 0;
	}
	:global(.chat-prose blockquote) {
		border-left: 3px solid currentColor;
		opacity: 0.7;
		margin: 0.4em 0;
		padding-left: 0.75em;
	}
	:global(.chat-prose strong) {
		font-weight: 600;
	}
	:global(.chat-prose em) {
		font-style: italic;
	}
	:global(.chat-prose a) {
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	:global(.chat-prose hr) {
		border: none;
		border-top: 1px solid currentColor;
		opacity: 0.2;
		margin: 0.75em 0;
	}
</style>
