<script lang="ts">
	import { trpc } from '$lib/utils/trpc';
	import ActionCard from '$lib/components/ai/ActionCard.svelte';
	import type { PendingAction } from '$lib/server/trpc/routers/ai';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Message = { id: string; role: 'user' | 'assistant'; content: string };
	type Conversation = (typeof data.conversations)[number];

	let conversations = $state(data.conversations);
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

	let messagesEnd: HTMLDivElement;

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
				message: text
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
				conversations = conv;
			} else {
				conversations = conversations.map((c) =>
					c.id === result.conversationId ? { ...c, updatedAt: new Date() } : c
				);
			}

			scrollToBottom();
		} catch (e) {
			messages = messages.filter((m) => m.id !== tempId);
			sendError = e instanceof Error ? e.message : 'Error al enviar';
		} finally {
			stopThinking();
			sending = false;
		}
	}

	async function deleteConversation(id: string, e: MouseEvent) {
		e.stopPropagation();
		if (!confirm('¿Eliminar esta conversación?')) return;
		await trpc.ai.deleteConversation.mutate(id);
		conversations = conversations.filter((c) => c.id !== id);
		if (activeConvId === id) newConversation();
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

	// ── Provider / model badge ────────────────────────────────────────────────
	type ProviderConfig = { provider: string; model: string | null; enabled: boolean };
	type AiConfigStatus = { providers: ProviderConfig[]; defaultProvider: string; defaultModel: string | null };

	const MODEL_LABELS: Record<string, Record<string, string>> = {
		openrouter: {
			'anthropic/claude-haiku-4-5': 'Claude Haiku 4.5',
			'anthropic/claude-sonnet-4-5': 'Claude Sonnet 4.5',
			'openai/gpt-4o-mini': 'GPT-4o mini',
			'openai/gpt-4o': 'GPT-4o',
			'google/gemini-flash-1.5': 'Gemini Flash 1.5',
			'meta-llama/llama-3.3-70b-instruct': 'Llama 3.3 70B'
		},
		perplexity: {
			sonar: 'Sonar',
			'sonar-pro': 'Sonar Pro',
			'sonar-reasoning-pro': 'Sonar Reasoning Pro',
			'sonar-deep-research': 'Sonar Deep Research'
		}
	};
	const MODEL_OPTIONS: Record<string, { id: string; label: string }[]> = {
		openrouter: [
			{ id: 'anthropic/claude-haiku-4-5', label: 'Claude Haiku 4.5' },
			{ id: 'anthropic/claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
			{ id: 'openai/gpt-4o-mini', label: 'GPT-4o mini' },
			{ id: 'openai/gpt-4o', label: 'GPT-4o' },
			{ id: 'google/gemini-flash-1.5', label: 'Gemini Flash 1.5' },
			{ id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B' }
		],
		perplexity: [
			{ id: 'sonar', label: 'Sonar' },
			{ id: 'sonar-pro', label: 'Sonar Pro' },
			{ id: 'sonar-reasoning-pro', label: 'Sonar Reasoning Pro' },
			{ id: 'sonar-deep-research', label: 'Sonar Deep Research' }
		]
	};
	const PROVIDER_DEFAULTS: Record<string, string> = {
		openrouter: 'anthropic/claude-haiku-4-5',
		perplexity: 'sonar'
	};

	let aiConfig = $state<AiConfigStatus | null>(null);

	const activeProvider = $derived(aiConfig?.defaultProvider ?? 'openrouter');
	const activeProviderConfig = $derived(aiConfig?.providers.find((p) => p.provider === activeProvider));
	const activeModel = $derived(
		aiConfig?.defaultModel ?? activeProviderConfig?.model ?? PROVIDER_DEFAULTS[activeProvider] ?? ''
	);
	const activeModelLabel = $derived(MODEL_LABELS[activeProvider]?.[activeModel] ?? activeModel);
	const providerLabel = $derived(activeProvider === 'perplexity' ? 'Perplexity' : 'OpenRouter');

	async function loadAiConfig() {
		try {
			aiConfig = await trpc.aiConfig.getStatus.query();
		} catch {
			// non-critical — badge just won't show
		}
	}

	async function handleModelChange(modelId: string) {
		try {
			await trpc.aiConfig.setModel.mutate({ provider: activeProvider as 'openrouter' | 'perplexity', model: modelId || null });
			if (aiConfig) {
				aiConfig = {
					...aiConfig,
					providers: aiConfig.providers.map((p) =>
						p.provider === activeProvider ? { ...p, model: modelId || null } : p
					)
				};
			}
		} catch {
			// ignore
		}
	}

	$effect(() => {
		loadAiConfig();
	});
</script>

<div class="flex h-[calc(100vh-4rem)] overflow-hidden">
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
				title="Nueva conversación"
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
								{conv.title ?? 'Conversación'}
							</span>
							<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
								{formatDate(conv.updatedAt)}
							</span>
						</button>
						<button
							type="button"
							aria-label="Eliminar conversación"
							onclick={(e) => deleteConversation(conv.id, e)}
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
							Asistente de investigación
						</p>
						<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
							Hazme preguntas sobre el contenido de tu proyecto.
						</p>
						<p class="mt-0.5 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
							Ej: "¿Qué referencias hay a Mises en el borrador?"
						</p>
					</div>
				</div>
			{:else}
				<div class="mx-auto flex max-w-2xl flex-col gap-6">
					{#each messages as msg (msg.id)}
						<div class="flex gap-3 {msg.role === 'user' ? 'flex-row-reverse' : ''}">
							<!-- Avatar -->
							<div
								class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold {msg.role === 'user' ? 'bg-accent text-white' : 'bg-paper-border text-ink-muted dark:bg-dark-paper-border dark:text-dark-ink-muted'}"
							>
								{msg.role === 'user' ? 'Tú' : 'AI'}
							</div>
							<!-- Bubble + pending actions for this message -->
							<div class="flex max-w-[80%] flex-col">
								<div
									class="rounded-2xl px-4 py-3 font-sans text-sm leading-relaxed {msg.role === 'user'
										? 'rounded-tr-sm bg-accent text-white'
										: 'rounded-tl-sm bg-paper-ui text-ink dark:bg-dark-paper-ui dark:text-dark-ink'}"
								>
									{msg.content}
								</div>
								{#if msg.id === lastAssistantMsgId && pendingActions.length > 0}
									{#each pendingActions as action, i (i)}
										<ActionCard
											{action}
											projectId={data.project.id}
											onconfirm={() => {
												pendingActions = pendingActions.filter((_, idx) => idx !== i);
											}}
											ondiscard={() => {
												pendingActions = pendingActions.filter((_, idx) => idx !== i);
											}}
										/>
									{/each}
								{/if}
							</div>
						</div>
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
						placeholder="Pregunta sobre tu proyecto... (Enter para enviar, Shift+Enter para nueva línea)"
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
					{#if aiConfig && activeProviderConfig}
						<div class="flex items-center gap-1.5 rounded-full border border-paper-border px-2.5 py-1 dark:border-dark-paper-border">
							<span class="font-sans text-[11px] text-ink-faint dark:text-dark-ink-faint">{providerLabel}</span>
							<span class="text-ink-faint dark:text-dark-ink-faint">·</span>
							<select
								value={activeModel}
								onchange={(e) => handleModelChange((e.target as HTMLSelectElement).value)}
								class="cursor-pointer bg-transparent font-sans text-[11px] text-ink-muted focus:outline-none dark:text-dark-ink-muted"
								aria-label="Cambiar modelo"
							>
								{#each MODEL_OPTIONS[activeProvider] ?? [] as m}
									<option value={m.id}>{m.label}</option>
								{/each}
							</select>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>
