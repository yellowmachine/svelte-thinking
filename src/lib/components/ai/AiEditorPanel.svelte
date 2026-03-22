<script lang="ts">
	type AgentMode = 'review' | 'structure' | 'draft' | 'question';

	type Message = {
		role: 'user' | 'assistant';
		content: string;
		sections?: {
			label: string;
			body: string;
		}[];
	};

	type Props = {
		/** Initial task mode selected */
		initialMode?: AgentMode;
		/** Seed messages to show in the panel */
		messages?: Message[];
		/** Whether the advanced (model) panel starts open */
		advancedOpen?: boolean;
		/** Provider label shown in badge */
		provider?: string;
		/** Model label shown in badge */
		model?: string;
	};

	let {
		initialMode = undefined,
		messages = [],
		advancedOpen = false,
		provider = 'OpenRouter',
		model = 'Claude Haiku 4.5'
	}: Props = $props();

	const MODES: { id: AgentMode; label: string; icon: string; hint: string }[] = [
		{
			id: 'review',
			label: 'Revisar redacción',
			icon: '✦',
			hint: 'Corrección de estilo, claridad y coherencia.'
		},
		{
			id: 'structure',
			label: 'Estructura y lógica',
			icon: '⬡',
			hint: 'Organización del argumento y flujo del texto.'
		},
		{
			id: 'draft',
			label: 'Generar borrador',
			icon: '◈',
			hint: 'Redacta a partir de tus notas y documentos.'
		},
		{
			id: 'question',
			label: 'Consulta teórica',
			icon: '◎',
			hint: 'Preguntas conceptuales y de escritura académica.'
		}
	];

	const MODELS = [
		'Claude Haiku 4.5',
		'Claude Sonnet 4.5',
		'GPT-4o mini',
		'GPT-4o',
		'Sonar',
		'Sonar Pro'
	];

	let activeMode = $state<AgentMode | undefined>(initialMode);
	let showAdvanced = $state(advancedOpen);
	let input = $state('');
	let selectedModel = $state(model);

	const activeModeData = $derived(MODES.find((m) => m.id === activeMode));
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
			<span class="font-sans text-sm font-medium text-ink dark:text-dark-ink">Asistente Scholio</span>
		</div>
		<!-- Provider badge -->
		<span class="rounded-full border border-paper-border px-2 py-0.5 font-sans text-[11px] text-ink-faint dark:border-dark-paper-border dark:text-dark-ink-faint">
			{provider}
		</span>
	</div>

	<!-- Task chips -->
	<div class="border-b border-paper-border px-3 py-3 dark:border-dark-paper-border">
		<p class="mb-2 font-sans text-[11px] font-medium uppercase tracking-wide text-ink-faint dark:text-dark-ink-faint">
			¿Qué quieres hacer?
		</p>
		<div class="flex flex-wrap gap-1.5">
			{#each MODES as mode}
				<button
					type="button"
					onclick={() => (activeMode = activeMode === mode.id ? undefined : mode.id)}
					title={mode.hint}
					class="flex items-center gap-1.5 rounded-full border px-3 py-1 font-sans text-xs transition-colors
						{activeMode === mode.id
							? 'border-accent bg-accent text-white'
							: 'border-paper-border text-ink-muted hover:border-accent/40 hover:text-ink dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:text-dark-ink'}"
				>
					<span class="text-[10px]">{mode.icon}</span>
					{mode.label}
				</button>
			{/each}
		</div>
		{#if activeModeData}
			<p class="mt-2 font-sans text-[11px] text-ink-faint dark:text-dark-ink-faint">
				{activeModeData.hint}
			</p>
		{/if}
	</div>

	<!-- Messages -->
	<div class="flex-1 overflow-y-auto px-4 py-4">
		{#if messages.length === 0}
			<div class="flex h-full flex-col items-center justify-center gap-3 text-center">
				<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
					{activeMode
						? `Modo: ${activeModeData?.label}. Escribe tu consulta abajo.`
						: 'Elige una tarea arriba o escribe directamente.'}
				</p>
				<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
					El asistente buscará en tus documentos antes de responder.
				</p>
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
						<div class="flex flex-col gap-2">
							<!-- Direct answer (always first) -->
							<div class="rounded-2xl rounded-tl-sm bg-paper-ui px-4 py-3 font-sans text-sm leading-relaxed text-ink dark:bg-dark-paper-ui dark:text-dark-ink">
								{msg.content}
							</div>

							<!-- Structured sections -->
							{#if msg.sections && msg.sections.length > 0}
								<div class="flex flex-col gap-2 pl-1">
									{#each msg.sections as section}
										<details class="group rounded-lg border border-paper-border dark:border-dark-paper-border">
											<summary class="flex cursor-pointer list-none items-center justify-between px-3 py-2">
												<span class="font-sans text-xs font-semibold text-ink-muted dark:text-dark-ink-muted">
													{section.label}
												</span>
												<svg
													class="h-3 w-3 shrink-0 text-ink-faint transition-transform group-open:rotate-180 dark:text-dark-ink-faint"
													viewBox="0 0 24 24" fill="none" aria-hidden="true"
												>
													<path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
												</svg>
											</summary>
											<div class="border-t border-paper-border px-3 py-2.5 font-sans text-xs leading-relaxed text-ink-muted dark:border-dark-paper-border dark:text-dark-ink-muted">
												{section.body}
											</div>
										</details>
									{/each}
								</div>
							{/if}
						</div>
					{/if}
				{/each}
			</div>
		{/if}
	</div>

	<!-- Input area -->
	<div class="border-t border-paper-border px-3 pb-3 pt-2.5 dark:border-dark-paper-border">
		<div class="flex items-end gap-2 rounded-xl border border-paper-border bg-paper-ui px-3 py-2 focus-within:border-accent dark:border-dark-paper-border dark:bg-dark-paper-ui">
			<textarea
				bind:value={input}
				placeholder={activeMode
					? `${activeModeData?.label}…`
					: 'Pregunta o pide ayuda con el documento…'}
				rows="2"
				class="flex-1 resize-none bg-transparent font-sans text-sm text-ink placeholder:text-ink-faint focus:outline-none dark:text-dark-ink"
				style="max-height: 100px;"
			></textarea>
			<button
				type="button"
				disabled={!input.trim()}
				class="shrink-0 rounded-lg bg-accent p-1.5 text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
				aria-label="Enviar"
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
			</button>
		</div>

		<!-- Advanced toggle + model -->
		<div class="mt-2 flex items-center justify-between">
			<button
				type="button"
				onclick={() => (showAdvanced = !showAdvanced)}
				class="font-sans text-[11px] text-ink-faint transition-colors hover:text-ink-muted dark:text-dark-ink-faint dark:hover:text-dark-ink-muted"
			>
				{showAdvanced ? '▴ Ocultar avanzado' : '▾ Motor de IA'}
			</button>
			{#if !showAdvanced}
				<span class="font-sans text-[11px] text-ink-faint dark:text-dark-ink-faint">
					{provider} · {selectedModel}
				</span>
			{/if}
		</div>

		{#if showAdvanced}
			<div class="mt-2 flex flex-col gap-2 rounded-lg border border-paper-border bg-paper-ui px-3 py-2.5 dark:border-dark-paper-border dark:bg-dark-paper-ui">
				<div>
					<p class="mb-1 font-sans text-[11px] font-medium text-ink-faint dark:text-dark-ink-faint">Modelo</p>
					<select
						bind:value={selectedModel}
						class="w-full rounded-md border border-paper-border bg-paper px-2 py-1.5 font-sans text-xs text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
					>
						{#each MODELS as m}
							<option value={m}>{m}</option>
						{/each}
					</select>
				</div>
			</div>
		{/if}
	</div>
</div>
