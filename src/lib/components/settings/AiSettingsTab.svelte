<script lang="ts">
	import { trpc } from '$lib/utils/trpc';
	import { invalidateAll } from '$app/navigation';
	import { MODEL_RECOMMENDATIONS, MODEL_SHORT_LABEL } from '$lib/ai-config';

	let {
		openrouterStatus
	}: {
		openrouterStatus: 'success' | 'error' | null;
	} = $props();

	type AiKey = {
		id: string;
		name: string;
		enabled: boolean;
		source: string;
		createdAt: Date;
		updatedAt: Date;
	};
	type TaskConfig = { keyId: string; model: string };
	type AiTaskId = 'agent' | 'draft' | 'review' | 'requirements';
	type AiTaskDef = {
		id: AiTaskId;
		label: string;
		description: string;
		hint: string;
		defaultModel: string;
	};
	type AiModel = { id: string; label: string; toolCalling: boolean; pricing: string | null };

	let aiKeys = $state<AiKey[]>([]);
	let aiTaskConfig = $state<Partial<Record<AiTaskId, TaskConfig>>>({});
	let aiModels = $state<AiModel[]>([]);
	let aiTasks = $state<AiTaskDef[]>([]);
	let loadingAi = $state(false);
	let aiLoaded = $state(false);
	let aiError = $state('');
	let aiSuccess = $state('');

	let newKeyName = $state('');
	let newKeyValue = $state('');
	let savingNewKey = $state(false);
	let showManualKeyForm = $state(false);

	let openrouterNotice = $state<'success' | 'error' | null>(openrouterStatus);

	let oauthKey = $derived(aiKeys.find((k) => k.source === 'openrouter_oauth') ?? null);

	let togglingKey = $state<Record<string, boolean>>({});
	let deletingKeyId = $state<string | null>(null);

	let savingTask = $state<Record<AiTaskId, boolean>>({
		agent: false,
		draft: false,
		review: false,
		requirements: false
	});

	function formatDate(d: Date | null): string {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' });
	}

	async function loadAiConfig() {
		loadingAi = true;
		aiError = '';
		try {
			const [keys, taskData, models] = await Promise.all([
				trpc.aiConfig.listKeys.query(),
				trpc.aiConfig.getTaskConfig.query(),
				trpc.aiConfig.getModels.query()
			]);
			aiKeys = keys;
			aiTaskConfig = taskData.taskConfig as Partial<Record<AiTaskId, TaskConfig>>;
			aiModels = models as AiModel[];
			aiTasks = taskData.tasks as AiTaskDef[];
		} catch {
			aiError = 'Could not load assistant configuration.';
		} finally {
			loadingAi = false;
			aiLoaded = true;
		}
	}

	async function handleAddKey() {
		if (!newKeyName.trim() || !newKeyValue.trim()) return;
		savingNewKey = true;
		aiError = '';
		aiSuccess = '';
		try {
			await trpc.aiConfig.addKey.mutate({ name: newKeyName.trim(), apiKey: newKeyValue.trim() });
			newKeyName = '';
			newKeyValue = '';
			aiSuccess = 'API key saved.';
			await loadAiConfig();
		} catch (e: unknown) {
			aiError = e instanceof Error ? e.message : 'Error saving key.';
		} finally {
			savingNewKey = false;
		}
	}

	async function handleToggleKey(keyId: string, enabled: boolean) {
		togglingKey[keyId] = true;
		aiError = '';
		try {
			await trpc.aiConfig.toggleKey.mutate({ keyId, enabled });
			aiKeys = aiKeys.map((k) => (k.id === keyId ? { ...k, enabled } : k));
		} catch (e: unknown) {
			aiError = e instanceof Error ? e.message : 'Error toggling key.';
		} finally {
			togglingKey[keyId] = false;
		}
	}

	async function handleDeleteKey(keyId: string) {
		deletingKeyId = null;
		aiError = '';
		aiSuccess = '';
		try {
			await trpc.aiConfig.deleteKey.mutate({ keyId });
			aiSuccess = 'API key deleted.';
			await loadAiConfig();
		} catch (e: unknown) {
			aiError = e instanceof Error ? e.message : 'Error deleting key.';
		}
	}

	async function handleSetTaskConfig(task: AiTaskId, keyId: string, model: string) {
		if (!keyId || !model) return;
		savingTask[task] = true;
		aiError = '';
		try {
			await trpc.aiConfig.setTaskConfig.mutate({ task, keyId, model });
			aiTaskConfig = { ...aiTaskConfig, [task]: { keyId, model } };
			await invalidateAll();
		} catch (e: unknown) {
			aiError = e instanceof Error ? e.message : 'Error saving task config.';
		} finally {
			savingTask[task] = false;
		}
	}

	async function handleClearTaskConfig(task: AiTaskId) {
		aiError = '';
		try {
			await trpc.aiConfig.clearTaskConfig.mutate({ task });
			const next = { ...aiTaskConfig };
			delete next[task];
			aiTaskConfig = next;
			await invalidateAll();
		} catch (e: unknown) {
			aiError = e instanceof Error ? e.message : 'Error clearing task config.';
		}
	}

	function confirmDeleteKey(keyId: string) {
		deletingKeyId = keyId;
	}

	async function executeDeleteKey() {
		if (!deletingKeyId) return;
		const keyId = deletingKeyId;
		await handleDeleteKey(keyId);
	}

	$effect(() => {
		if (!aiLoaded && !loadingAi) loadAiConfig();
	});
</script>

<div class="flex flex-col gap-6">
	<div class="flex justify-end">
		<a
			href="/usage"
			class="font-sans text-sm text-accent underline decoration-dotted hover:decoration-solid"
			>View AI usage dashboard →</a
		>
	</div>
	{#if aiError}
		<div
			class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400"
		>
			{aiError}
		</div>
	{/if}
	{#if aiSuccess}
		<div
			class="rounded-lg border border-green-200 bg-green-50 px-4 py-3 font-sans text-sm text-green-700 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-400"
		>
			{aiSuccess}
		</div>
	{/if}

	{#if loadingAi}
		<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">Loading...</p>
	{:else}
		<!-- ── Section 1: API Keys ── -->
		<section
			class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper"
		>
			<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">
				AI Connection
			</h2>
			<p class="mb-5 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				Connect your OpenRouter account to enable AI features. OpenRouter gives you access to dozens
				of AI models with a single connection.
			</p>

			<!-- OpenRouter OAuth feedback -->
			{#if openrouterNotice === 'success'}
				<div
					class="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 font-sans text-sm text-green-700 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-400"
				>
					OpenRouter connected successfully.
				</div>
			{:else if openrouterNotice === 'error'}
				<div
					class="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400"
				>
					Could not connect OpenRouter. Please try again.
				</div>
			{/if}

			<!-- OAuth connection status -->
			{#if oauthKey}
				<div
					class="mb-5 flex items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 dark:border-green-900/40 dark:bg-green-900/20"
				>
					<div class="flex items-center gap-2.5">
						<svg
							class="h-4 w-4 shrink-0 text-green-600 dark:text-green-400"
							viewBox="0 0 24 24"
							fill="none"
							aria-hidden="true"
						>
							<path
								d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
						<div>
							<p class="font-sans text-sm font-medium text-green-800 dark:text-green-300">
								Connected via OpenRouter
							</p>
							<p class="font-sans text-xs text-green-700 dark:text-green-400">
								Added {formatDate(oauthKey.createdAt)}
							</p>
						</div>
					</div>
					<button
						type="button"
						onclick={() => confirmDeleteKey(oauthKey!.id)}
						class="inline-flex items-center gap-1 font-sans text-xs text-red-500 transition-colors hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
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
							<path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
							<path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
							<line x1="2" y1="2" x2="22" y2="22" />
						</svg>
						Disconnect
					</button>
				</div>
			{:else}
				<!-- Connect button -->
				<a
					href="/api/openrouter/connect"
					class="mb-4 flex w-full items-center justify-center gap-2.5 rounded-lg bg-accent px-4 py-3 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90"
				>
					<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path
							d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					Connect with OpenRouter
				</a>
			{/if}

			<!-- Privacy notice -->
			<div
				class="mb-5 flex gap-2.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 dark:border-blue-900/50 dark:bg-blue-950/30"
			>
				<svg
					class="mt-0.5 h-4 w-4 shrink-0 text-blue-500 dark:text-blue-400"
					viewBox="0 0 24 24"
					fill="none"
					aria-hidden="true"
				>
					<path
						d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linejoin="round"
					/>
				</svg>
				<p class="font-sans text-xs leading-relaxed text-blue-800 dark:text-blue-300">
					Your documents are sent to OpenRouter only to process your query. OpenRouter does not use
					API data to train models.
					<a
						href="https://openrouter.ai/privacy"
						target="_blank"
						rel="noopener noreferrer"
						class="font-medium underline underline-offset-2">Privacy Policy →</a
					>
				</p>
			</div>

			<!-- Manual keys (non-OAuth) -->
			{#if aiKeys.filter((k) => k.source === 'manual').length > 0}
				<div class="mb-4 flex flex-col gap-2">
					{#each aiKeys.filter((k) => k.source === 'manual') as key}
						<div
							class="flex items-center justify-between gap-3 rounded-lg border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
						>
							<div class="min-w-0 flex-1">
								<p class="font-sans text-sm font-medium text-ink dark:text-dark-ink">
									{key.name}
								</p>
								<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
									Added {formatDate(key.createdAt)}
								</p>
							</div>
							<div class="flex items-center gap-3">
								<span
									class="font-sans text-xs {key.enabled
										? 'text-green-600 dark:text-green-400'
										: 'text-ink-muted dark:text-dark-ink-muted'}"
								>
									{key.enabled ? 'Active' : 'Inactive'}
								</span>
								<button
									type="button"
									role="switch"
									aria-checked={key.enabled}
									aria-label={`${key.enabled ? 'Disable' : 'Enable'} key ${key.name}`}
									onclick={() => handleToggleKey(key.id, !key.enabled)}
									disabled={togglingKey[key.id]}
									class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 {key.enabled
										? 'bg-accent'
										: 'bg-paper-border dark:bg-dark-paper-border'}"
								>
									<span
										class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 {key.enabled
											? 'translate-x-4'
											: 'translate-x-0'}"
									></span>
								</button>
								<button
									type="button"
									onclick={() => confirmDeleteKey(key.id)}
									class="inline-flex items-center gap-1 font-sans text-xs text-red-500 transition-colors hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
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
										<polyline points="3 6 5 6 21 6" />
										<path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
										<path d="M10 11v6M14 11v6" />
										<path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
									</svg>
									Delete
								</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}

			<!-- Enter key manually toggle -->
			<button
				type="button"
				onclick={() => (showManualKeyForm = !showManualKeyForm)}
				class="mb-3 inline-flex items-center gap-1 font-sans text-sm text-ink-muted underline decoration-dotted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
			>
				{showManualKeyForm ? 'Hide manual entry' : 'Enter key manually'}
				<svg
					width="13"
					height="13"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					{#if showManualKeyForm}
						<polyline points="18 15 12 9 6 15" />
					{:else}
						<polyline points="6 9 12 15 18 9" />
					{/if}
				</svg>
			</button>

			{#if showManualKeyForm}
				<div class="flex flex-col gap-3">
					<input
						type="text"
						bind:value={newKeyName}
						placeholder="Name (e.g. 'My OpenRouter key')"
						class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
					/>
					<div class="flex gap-3">
						<input
							type="password"
							bind:value={newKeyValue}
							placeholder="sk-or-v1-..."
							autocomplete="off"
							class="flex-1 rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-mono text-sm text-ink placeholder:font-sans placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
						/>
						<button
							type="button"
							onclick={handleAddKey}
							disabled={!newKeyName.trim() || !newKeyValue.trim() || savingNewKey}
							class="flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
						>
							{#if !savingNewKey}
								<svg
									width="13"
									height="13"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
									<polyline points="17 21 17 13 7 13 7 21" />
									<polyline points="7 3 7 8 15 8" />
								</svg>
							{/if}
							{savingNewKey ? 'Saving...' : 'Save'}
						</button>
					</div>
					<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
						Encrypted before storage.
					</p>
				</div>
			{/if}
		</section>

		<!-- ── Section 2: Task configuration ── -->
		{#if aiKeys.length > 0}
			<section
				class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper"
			>
				<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">
					Task configuration
				</h2>
				<p class="mb-5 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
					Choose which key and model to use for each AI feature. Falls back to the first active key
					if not configured.
				</p>

				<div class="flex flex-col gap-4">
					{#each aiTasks as task}
						{@const cfg = aiTaskConfig[task.id as AiTaskId]}
						{@const enabledKeys = aiKeys.filter((k) => k.enabled)}
						<div
							class="rounded-lg border border-paper-border bg-paper-ui px-4 py-4 dark:border-dark-paper-border dark:bg-dark-paper-ui"
						>
							<div class="mb-3 flex items-center justify-between">
								<div>
									<div class="flex items-center gap-1.5">
										<p class="font-sans text-sm font-medium text-ink dark:text-dark-ink">
											{task.label}
										</p>
										<div class="group relative">
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-3.5 w-3.5 cursor-default text-ink-faint dark:text-dark-ink-faint"
												viewBox="0 0 20 20"
												fill="currentColor"
											>
												<path
													fill-rule="evenodd"
													d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
													clip-rule="evenodd"
												/>
											</svg>
											<div
												class="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 w-64 -translate-x-1/2 rounded-md bg-ink px-3 py-2 font-sans text-xs text-paper opacity-0 shadow-md transition-opacity group-hover:opacity-100 dark:bg-dark-ink dark:text-dark-paper"
											>
												{task.hint}
												<div
													class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-ink dark:border-t-dark-ink"
												></div>
											</div>
										</div>
									</div>
									<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
										{task.description}
									</p>
								</div>
								{#if cfg}
									<button
										type="button"
										onclick={() => handleClearTaskConfig(task.id as AiTaskId)}
										class="font-sans text-xs text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
									>
										Reset
									</button>
								{/if}
							</div>
							<div class="flex gap-3">
								<select
									value={cfg?.keyId ?? ''}
									onchange={async (e) => {
										const keyId = (e.target as HTMLSelectElement).value;
										const model = cfg?.model ?? aiModels[0]?.id ?? '';
										if (keyId) await handleSetTaskConfig(task.id as AiTaskId, keyId, model);
									}}
									class="flex-1 rounded-md border border-paper-border bg-paper px-2 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
								>
									<option value="">— First active key —</option>
									{#each enabledKeys as key}
										<option value={key.id}>{key.name}</option>
									{/each}
								</select>
								<select
									value={cfg?.model ?? ''}
									onchange={async (e) => {
										const model = (e.target as HTMLSelectElement).value;
										const keyId = cfg?.keyId ?? enabledKeys[0]?.id ?? '';
										if (model && keyId)
											await handleSetTaskConfig(task.id as AiTaskId, keyId, model);
									}}
									class="flex-1 rounded-md border border-paper-border bg-paper px-2 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
								>
									<option value=""
										>— Default ({MODEL_SHORT_LABEL[task.defaultModel] ?? task.defaultModel}) —</option
									>
									{#each task.id === 'agent' ? aiModels.filter((m) => m.toolCalling) : aiModels as m}
										{@const isRec = MODEL_RECOMMENDATIONS[m.id]?.includes(
											task.id as 'agent' | 'draft' | 'review' | 'requirements'
										)}
										<option value={m.id}
											>{isRec ? '★ ' : ''}{m.label}{m.pricing ? ` — ${m.pricing}` : ''}</option
										>
									{/each}
								</select>
							</div>
							{#if task.id === 'agent' && cfg?.model && !aiModels.find((m) => m.id === cfg.model)?.toolCalling}
								<p class="mt-2 font-sans text-xs text-amber-600 dark:text-amber-400">
									⚠ This model may not support tool calling required by the agent.
								</p>
							{/if}
						</div>
					{/each}
				</div>
			</section>
		{/if}
	{/if}
</div>

<!-- Delete API key confirmation dialog -->
{#if deletingKeyId}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
		role="dialog"
		aria-modal="true"
	>
		<div class="w-full max-w-sm rounded-2xl bg-paper p-6 shadow-xl dark:bg-dark-paper">
			<h2 class="font-serif text-lg font-semibold text-ink dark:text-dark-ink">Delete API key?</h2>
			<p class="mt-2 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
				<strong>{aiKeys.find((k) => k.id === deletingKeyId)?.name ?? 'This key'}</strong> will be deleted.
				Any task configured with this key will fall back to the first active key.
			</p>
			<div class="mt-5 flex gap-3">
				<button
					type="button"
					onclick={() => (deletingKeyId = null)}
					class="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
				>
					<svg
						width="13"
						height="13"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M18 6L6 18M6 6l12 12" />
					</svg>
					Cancel
				</button>
				<button
					type="button"
					onclick={executeDeleteKey}
					class="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-red-600 px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-red-700"
				>
					<svg
						width="13"
						height="13"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<polyline points="3 6 5 6 21 6" />
						<path d="M19 6l-1 14H6L5 6" />
						<path d="M10 11v6M14 11v6" />
						<path d="M9 6V4h6v2" />
					</svg>
					Delete
				</button>
			</div>
		</div>
	</div>
{/if}
