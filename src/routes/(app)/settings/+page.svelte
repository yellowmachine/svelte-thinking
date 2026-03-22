<script lang="ts">
	import type { PageData } from './$types';
	import { trpc } from '$lib/utils/trpc';
	import { onMount } from 'svelte';
	import QRCode from 'qrcode';

	let { data }: { data: PageData } = $props();

	// Profile form state
	let name = $state(data.user.name);
	let email = $state(data.user.email);
	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');

	// Active section
	let activeTab: 'profile' | 'billing' | 'ai' | 'security' = $state('profile');

	// Billing state
	type PlanInfo = {
		plan: string;
		planStatus: string | null;
		planCurrentPeriodEnd: Date | null;
		stripeCustomerId: string | null;
	};
	let planData = $state<PlanInfo | null>(null);
	let loadingPlan = $state(false);
	let checkoutLoading: string | null = $state(null);
	let portalLoading = $state(false);
	let billingError = $state('');

	onMount(async () => {
		loadingPlan = true;
		try {
			planData = await trpc.billing.currentPlan.query();
		} catch {
			billingError = 'No se pudo cargar la información del plan.';
		} finally {
			loadingPlan = false;
		}
	});

	const currentPlanName = $derived(planData?.plan ?? 'free');

	async function handleUpgrade(plan: 'pro' | 'team') {
		checkoutLoading = plan;
		billingError = '';
		try {
			const result = await trpc.billing.createCheckoutSession.mutate({ plan });
			if (result.url) window.location.href = result.url;
		} catch (e: unknown) {
			billingError = e instanceof Error ? e.message : 'Error al iniciar el pago.';
		} finally {
			checkoutLoading = null;
		}
	}

	async function handleManage() {
		portalLoading = true;
		billingError = '';
		try {
			const result = await trpc.billing.createPortalSession.mutate();
			if (result.url) window.location.href = result.url;
		} catch (e: unknown) {
			billingError = e instanceof Error ? e.message : 'Error al abrir el portal.';
		} finally {
			portalLoading = false;
		}
	}

	function formatDate(d: Date | null): string {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
	}

	// ── AI config state ──────────────────────────────────────────────────────
	type ProviderConfig = { provider: string; model: string | null; enabled: boolean; updatedAt: Date };
	type AiStatus = { providers: ProviderConfig[]; defaultProvider: string; defaultModel: string | null };

	const PROVIDERS = [
		{
			id: 'openrouter',
			label: 'OpenRouter',
			placeholder: 'sk-or-v1-...',
			keyUrl: 'https://openrouter.ai/keys',
			privacyUrl: 'https://openrouter.ai/privacy'
		},
		{
			id: 'perplexity',
			label: 'Perplexity',
			placeholder: 'pplx-...',
			keyUrl: 'https://www.perplexity.ai/settings/api',
			privacyUrl: 'https://www.perplexity.ai/hub/legal/privacy-policy'
		}
	] as const;
	type ProviderId = (typeof PROVIDERS)[number]['id'];

	const MODELS: Record<ProviderId, { id: string; label: string }[]> = {
		openrouter: [
			{ id: 'anthropic/claude-haiku-4-5', label: 'Claude Haiku 4.5 (rápido)' },
			{ id: 'anthropic/claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
			{ id: 'openai/gpt-4o-mini', label: 'GPT-4o mini (rápido)' },
			{ id: 'openai/gpt-4o', label: 'GPT-4o' },
			{ id: 'google/gemini-flash-1.5', label: 'Gemini Flash 1.5 (rápido)' },
			{ id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B' }
		],
		perplexity: [
			{ id: 'sonar', label: 'Sonar (rápido)' },
			{ id: 'sonar-pro', label: 'Sonar Pro' },
			{ id: 'sonar-reasoning-pro', label: 'Sonar Reasoning Pro' },
			{ id: 'sonar-deep-research', label: 'Sonar Deep Research' }
		]
	};

	let aiStatus = $state<AiStatus | null>(null);
	let loadingAi = $state(false);
	let aiError = $state('');
	let aiSuccess = $state('');

	// Per-provider UI state
	let keyInputs = $state<Record<ProviderId, string>>({ openrouter: '', perplexity: '' });
	let savingKey = $state<Record<ProviderId, boolean>>({ openrouter: false, perplexity: false });
	let togglingEnabled = $state<Record<ProviderId, boolean>>({ openrouter: false, perplexity: false });
	let deletingKey = $state<Record<ProviderId, boolean>>({ openrouter: false, perplexity: false });
	let settingDefault = $state(false);

	function providerConfig(id: ProviderId): ProviderConfig | undefined {
		return aiStatus?.providers.find((p) => p.provider === id);
	}

	async function loadAiStatus() {
		loadingAi = true;
		aiError = '';
		try {
			aiStatus = await trpc.aiConfig.getStatus.query();
		} catch {
			aiError = 'No se pudo cargar la configuración del asistente.';
		} finally {
			loadingAi = false;
		}
	}

	async function handleSaveKey(provider: ProviderId) {
		const key = keyInputs[provider].trim();
		if (!key) return;
		savingKey[provider] = true;
		aiError = '';
		aiSuccess = '';
		try {
			await trpc.aiConfig.saveApiKey.mutate({ provider, apiKey: key });
			keyInputs[provider] = '';
			aiSuccess = `API key de ${provider === 'openrouter' ? 'OpenRouter' : 'Perplexity'} guardada.`;
			await loadAiStatus();
		} catch (e: unknown) {
			aiError = e instanceof Error ? e.message : 'Error al guardar la API key.';
		} finally {
			savingKey[provider] = false;
		}
	}

	async function handleToggleEnabled(provider: ProviderId, enabled: boolean) {
		togglingEnabled[provider] = true;
		aiError = '';
		try {
			await trpc.aiConfig.toggleEnabled.mutate({ provider, enabled });
			if (aiStatus) {
				aiStatus = {
					...aiStatus,
					providers: aiStatus.providers.map((p) => (p.provider === provider ? { ...p, enabled } : p))
				};
			}
		} catch (e: unknown) {
			aiError = e instanceof Error ? e.message : 'Error al cambiar el estado.';
		} finally {
			togglingEnabled[provider] = false;
		}
	}

	async function handleSetModel(provider: ProviderId, model: string) {
		try {
			await trpc.aiConfig.setModel.mutate({ provider, model: model || null });
			if (aiStatus) {
				aiStatus = {
					...aiStatus,
					providers: aiStatus.providers.map((p) => (p.provider === provider ? { ...p, model: model || null } : p))
				};
			}
		} catch (e: unknown) {
			aiError = e instanceof Error ? e.message : 'Error al cambiar el modelo.';
		}
	}

	async function handleDeleteKey(provider: ProviderId) {
		const label = provider === 'openrouter' ? 'OpenRouter' : 'Perplexity';
		if (!confirm(`¿Eliminar la API key de ${label}? Perderás acceso hasta que añadas una nueva.`)) return;
		deletingKey[provider] = true;
		aiError = '';
		aiSuccess = '';
		try {
			await trpc.aiConfig.deleteApiKey.mutate({ provider });
			aiSuccess = `API key de ${label} eliminada.`;
			await loadAiStatus();
		} catch (e: unknown) {
			aiError = e instanceof Error ? e.message : 'Error al eliminar la API key.';
		} finally {
			deletingKey[provider] = false;
		}
	}

	async function handleSetDefault(provider: ProviderId) {
		settingDefault = true;
		aiError = '';
		try {
			await trpc.aiConfig.setDefault.mutate({ provider });
			if (aiStatus) aiStatus = { ...aiStatus, defaultProvider: provider };
		} catch (e: unknown) {
			aiError = e instanceof Error ? e.message : 'Error al cambiar el proveedor por defecto.';
		} finally {
			settingDefault = false;
		}
	}

	$effect(() => {
		if (activeTab === 'ai' && aiStatus === null) loadAiStatus();
	});

	// ── 2FA state ─────────────────────────────────────────────────────────────
	type TwoFaStep = 'idle' | 'enabling' | 'qr' | 'verifying' | 'done' | 'disabling';
	let twoFaEnabled = $state(data.user.twoFactorEnabled);
	let twoFaStep: TwoFaStep = $state('idle');
	let twoFaPassword = $state('');
	let twoFaCode = $state('');
	let twoFaQrDataUrl = $state('');
	let twoFaBackupCodes = $state<string[]>([]);
	let twoFaError = $state('');
	let twoFaLoading = $state(false);

	async function handleEnableTwoFa() {
		if (!twoFaPassword.trim()) return;
		twoFaLoading = true;
		twoFaError = '';
		try {
			const res = await fetch('/api/auth/two-factor/enable', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password: twoFaPassword })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.message || 'Error al activar 2FA');
			}
			const { totpURI, backupCodes } = await res.json();
			twoFaQrDataUrl = await QRCode.toDataURL(totpURI);
			twoFaBackupCodes = backupCodes;
			twoFaPassword = '';
			twoFaStep = 'qr';
		} catch (e) {
			twoFaError = e instanceof Error ? e.message : 'Error inesperado';
		} finally {
			twoFaLoading = false;
		}
	}

	async function handleVerifyTwoFa() {
		if (twoFaCode.length !== 6) return;
		twoFaLoading = true;
		twoFaError = '';
		try {
			const res = await fetch('/api/auth/two-factor/verify-totp', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code: twoFaCode })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.message || 'Código incorrecto');
			}
			twoFaEnabled = true;
			twoFaStep = 'done';
			twoFaCode = '';
		} catch (e) {
			twoFaError = e instanceof Error ? e.message : 'Código incorrecto';
		} finally {
			twoFaLoading = false;
		}
	}

	async function handleDisableTwoFa() {
		if (!twoFaPassword.trim()) return;
		twoFaLoading = true;
		twoFaError = '';
		try {
			const res = await fetch('/api/auth/two-factor/disable', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password: twoFaPassword })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.message || 'Error al desactivar 2FA');
			}
			twoFaEnabled = false;
			twoFaStep = 'idle';
			twoFaPassword = '';
		} catch (e) {
			twoFaError = e instanceof Error ? e.message : 'Error inesperado';
		} finally {
			twoFaLoading = false;
		}
	}

	// ── Delete account ────────────────────────────────────────────────────────
	let showDeleteDialog = $state(false);
	let deleteConfirmText = $state('');
	let deletingAccount = $state(false);
	let deleteError = $state('');
	const DELETE_KEYWORD = 'ELIMINAR';

	async function handleDeleteAccount() {
		if (deleteConfirmText !== DELETE_KEYWORD) return;
		deletingAccount = true;
		deleteError = '';
		try {
			const res = await fetch('/api/account/delete', { method: 'DELETE' });
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.message ?? 'Error al eliminar la cuenta');
			}
			window.location.href = '/?deleted=1';
		} catch (e) {
			deleteError = e instanceof Error ? e.message : 'Error inesperado';
			deletingAccount = false;
		}
	}
</script>

<div class="mx-auto max-w-3xl px-6 py-10">
	<!-- Header -->
	<div class="mb-8">
		<h1 class="font-serif text-3xl font-semibold text-ink dark:text-dark-ink">Ajustes</h1>
		<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Gestiona tu cuenta y suscripción.
		</p>
	</div>

	<!-- Tabs -->
	<div class="mb-8 flex gap-1 border-b border-paper-border dark:border-dark-paper-border">
		<button
			type="button"
			onclick={() => (activeTab = 'profile')}
			class="px-4 pb-3 font-sans text-sm transition-colors {activeTab === 'profile'
				? 'border-b-2 border-accent font-medium text-accent'
				: 'text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink'}"
		>
			Perfil
		</button>
		<button
			type="button"
			onclick={() => (activeTab = 'billing')}
			class="px-4 pb-3 font-sans text-sm transition-colors {activeTab === 'billing'
				? 'border-b-2 border-accent font-medium text-accent'
				: 'text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink'}"
		>
			Plan y facturación
		</button>
		<button
			type="button"
			onclick={() => (activeTab = 'ai')}
			class="px-4 pb-3 font-sans text-sm transition-colors {activeTab === 'ai'
				? 'border-b-2 border-accent font-medium text-accent'
				: 'text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink'}"
		>
			Asistente IA
		</button>
		<button
			type="button"
			onclick={() => (activeTab = 'security')}
			class="px-4 pb-3 font-sans text-sm transition-colors {activeTab === 'security'
				? 'border-b-2 border-accent font-medium text-accent'
				: 'text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink'}"
		>
			Seguridad
		</button>
	</div>

	<!-- ── PROFILE TAB ── -->
	{#if activeTab === 'profile'}
		<div class="flex flex-col gap-8">

			<!-- Personal info -->
			<section class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper">
				<h2 class="mb-5 font-serif text-lg font-semibold text-ink dark:text-dark-ink">
					Información personal
				</h2>

				<div class="flex flex-col gap-4">
					<!-- Avatar placeholder -->
					<div class="flex items-center gap-4">
						<div class="flex h-16 w-16 items-center justify-center rounded-full bg-accent font-serif text-2xl font-semibold text-white">
							{data.user.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
						</div>
						<div>
							<button
								type="button"
								disabled
								class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted opacity-50 dark:border-dark-paper-border dark:text-dark-ink-muted"
							>
								Cambiar foto
							</button>
							<p class="mt-1 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">Próximamente</p>
						</div>
					</div>

					<div class="grid gap-4 sm:grid-cols-2">
						<div class="flex flex-col gap-1.5">
							<label for="name" class="font-sans text-sm font-medium text-ink dark:text-dark-ink">
								Nombre
							</label>
							<input
								id="name"
								type="text"
								bind:value={name}
								class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
							/>
						</div>

						<div class="flex flex-col gap-1.5">
							<label for="email" class="font-sans text-sm font-medium text-ink dark:text-dark-ink">
								Email
							</label>
							<input
								id="email"
								type="email"
								bind:value={email}
								class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
							/>
						</div>
					</div>

					<div class="flex justify-end">
						<button
							type="button"
							disabled
							class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white opacity-50"
						>
							Guardar cambios
						</button>
					</div>
				</div>
			</section>

			<!-- Change password -->
			<section class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper">
				<h2 class="mb-5 font-serif text-lg font-semibold text-ink dark:text-dark-ink">
					Cambiar contraseña
				</h2>

				<div class="flex flex-col gap-4">
					<div class="flex flex-col gap-1.5">
						<label for="current-password" class="font-sans text-sm font-medium text-ink dark:text-dark-ink">
							Contraseña actual
						</label>
						<input
							id="current-password"
							type="password"
							bind:value={currentPassword}
							placeholder="••••••••"
							class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
						/>
					</div>

					<div class="grid gap-4 sm:grid-cols-2">
						<div class="flex flex-col gap-1.5">
							<label for="new-password" class="font-sans text-sm font-medium text-ink dark:text-dark-ink">
								Nueva contraseña
							</label>
							<input
								id="new-password"
								type="password"
								bind:value={newPassword}
								placeholder="••••••••"
								class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
							/>
						</div>
						<div class="flex flex-col gap-1.5">
							<label for="confirm-password" class="font-sans text-sm font-medium text-ink dark:text-dark-ink">
								Confirmar contraseña
							</label>
							<input
								id="confirm-password"
								type="password"
								bind:value={confirmPassword}
								placeholder="••••••••"
								class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
							/>
						</div>
					</div>

					<div class="flex justify-end">
						<button
							type="button"
							disabled
							class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white opacity-50"
						>
							Actualizar contraseña
						</button>
					</div>
				</div>
			</section>

			<!-- Danger zone -->
			<section class="rounded-xl border border-red-200 bg-paper p-6 dark:border-red-900/40 dark:bg-dark-paper">
				<h2 class="mb-1 font-serif text-lg font-semibold text-red-600 dark:text-red-400">
					Zona de peligro
				</h2>
				<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
					Estas acciones son irreversibles.
				</p>
				<button
					type="button"
					disabled
					class="rounded-md border border-red-300 px-4 py-2 font-sans text-sm text-red-600 opacity-50 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
				>
					Eliminar cuenta
				</button>
			</section>
		</div>

	<!-- ── AI TAB ── -->
	{:else if activeTab === 'ai'}
		<div class="flex flex-col gap-6">

			{#if aiError}
				<div class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">
					{aiError}
				</div>
			{/if}
			{#if aiSuccess}
				<div class="rounded-lg border border-green-200 bg-green-50 px-4 py-3 font-sans text-sm text-green-700 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-400">
					{aiSuccess}
				</div>
			{/if}

			{#if loadingAi}
				<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">Cargando...</p>
			{:else}
				<!-- Default provider selector -->
				{#if aiStatus && aiStatus.providers.length > 0}
					<section class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper">
						<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">Proveedor por defecto</h2>
						<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
							El agente usará este proveedor para todas las conversaciones.
						</p>
						<div class="flex gap-3">
							{#each PROVIDERS as p}
								{@const configured = !!providerConfig(p.id)}
								<button
									type="button"
									disabled={!configured || settingDefault}
									onclick={() => handleSetDefault(p.id)}
									class="flex items-center gap-2 rounded-lg border px-4 py-2.5 font-sans text-sm transition-colors disabled:opacity-40
										{aiStatus.defaultProvider === p.id
											? 'border-accent bg-accent/5 font-medium text-accent dark:bg-accent/10'
											: 'border-paper-border text-ink-muted hover:border-accent/40 hover:text-ink dark:border-dark-paper-border dark:text-dark-ink-muted'}"
								>
									{#if aiStatus.defaultProvider === p.id}
										<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
											<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
											<circle cx="12" cy="12" r="5" fill="currentColor"/>
										</svg>
									{:else}
										<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
											<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
										</svg>
									{/if}
									{p.label}
									{#if !configured}
										<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">(sin configurar)</span>
									{/if}
								</button>
							{/each}
						</div>
					</section>
				{/if}

				<!-- Provider cards -->
				{#each PROVIDERS as p}
					{@const cfg = providerConfig(p.id)}
					{@const isDefault = aiStatus?.defaultProvider === p.id}
					<section class="rounded-xl border bg-paper p-6 dark:bg-dark-paper
						{isDefault && cfg ? 'border-accent/30 dark:border-accent/20' : 'border-paper-border dark:border-dark-paper-border'}">

						<!-- Card header -->
						<div class="flex items-start justify-between gap-4">
							<div class="flex items-center gap-3">
								<div>
									<div class="flex items-center gap-2">
										<h2 class="font-serif text-lg font-semibold text-ink dark:text-dark-ink">{p.label}</h2>
										{#if isDefault && cfg}
											<span class="rounded-full bg-accent/10 px-2 py-0.5 font-sans text-[11px] font-semibold text-accent">
												Por defecto
											</span>
										{/if}
									</div>
									<p class="mt-0.5 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
										{p.id === 'openrouter'
											? 'Acceso a modelos de Anthropic, OpenAI, Google y más.'
											: 'Modelos Sonar con búsqueda web en tiempo real.'}
									</p>
								</div>
							</div>
							{#if cfg}
								<span class="shrink-0 rounded-full px-3 py-1 font-sans text-xs font-semibold
									{cfg.enabled
										? 'border border-green-300 text-green-700 dark:border-green-700 dark:text-green-400'
										: 'border border-paper-border text-ink-muted dark:border-dark-paper-border dark:text-dark-ink-muted'}">
									{cfg.enabled ? 'Activo' : 'Inactivo'}
								</span>
							{/if}
						</div>

						{#if cfg}
							<div class="mt-5 flex flex-col gap-4">
								<!-- Model selector + last updated -->
								<div class="rounded-lg border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui">
									<div class="flex items-center justify-between gap-4">
										<div class="min-w-0 flex-1">
											<p class="mb-1 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">Modelo</p>
											<select
												value={cfg.model ?? ''}
												onchange={(e) => handleSetModel(p.id, (e.target as HTMLSelectElement).value)}
												class="w-full rounded-md border border-paper-border bg-paper px-2 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
											>
												<option value="">— Por defecto del proveedor —</option>
												{#each MODELS[p.id] as m}
													<option value={m.id}>{m.label}</option>
												{/each}
											</select>
										</div>
										<div class="shrink-0 text-right">
											<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">Actualizada</p>
											<p class="mt-0.5 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
												{formatDate(cfg.updatedAt)}
											</p>
										</div>
									</div>
								</div>

								<!-- Enable toggle -->
								<div class="flex items-center justify-between">
									<div>
										<p class="font-sans text-sm font-medium text-ink dark:text-dark-ink">Habilitado</p>
										<p class="font-sans text-xs text-ink-muted dark:text-dark-ink-muted">Desactívalo sin eliminar la key.</p>
									</div>
									<button
										type="button"
										role="switch"
										aria-checked={cfg.enabled}
										aria-label={cfg.enabled ? 'Deshabilitar' : 'Habilitar'}
										onclick={() => handleToggleEnabled(p.id, !cfg.enabled)}
										disabled={togglingEnabled[p.id]}
										class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50
											{cfg.enabled ? 'bg-accent' : 'bg-paper-border dark:bg-dark-paper-border'}"
									>
										<span class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200
											{cfg.enabled ? 'translate-x-5' : 'translate-x-0'}"></span>
									</button>
								</div>
							</div>
						{/if}

						<!-- Key input (always shown) -->
						<div class="mt-5 border-t border-paper-border pt-5 dark:border-dark-paper-border">
							<!-- Privacy notice -->
							<div class="mb-4 flex gap-2.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 dark:border-blue-900/50 dark:bg-blue-950/30">
								<svg class="mt-0.5 h-4 w-4 shrink-0 text-blue-500 dark:text-blue-400" viewBox="0 0 24 24" fill="none" aria-hidden="true">
									<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
								</svg>
								<p class="font-sans text-xs leading-relaxed text-blue-800 dark:text-blue-300">
									Tus documentos se envían a {p.label} únicamente para procesar tu consulta.
									{p.label} no usa datos enviados vía API para entrenar sus modelos.
									<a href={p.privacyUrl} target="_blank" rel="noopener noreferrer" class="font-medium underline underline-offset-2">
										Política de privacidad de {p.label} →
									</a>
								</p>
							</div>
							<p class="mb-3 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
								{cfg ? 'Reemplazar API key · ' : 'Añadir API key · '}
								Obtenla en <a href={p.keyUrl} target="_blank" rel="noopener noreferrer" class="text-accent underline underline-offset-2">{p.keyUrl.replace('https://', '')}</a>.
								Se cifra con AWS KMS antes de almacenarse.
							</p>
							<div class="flex gap-3">
								<input
									type="password"
									bind:value={keyInputs[p.id]}
									placeholder={p.placeholder}
									autocomplete="off"
									class="flex-1 rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-mono text-sm text-ink placeholder:font-sans placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
								/>
								<button
									type="button"
									onclick={() => handleSaveKey(p.id)}
									disabled={!keyInputs[p.id].trim() || savingKey[p.id]}
									class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
								>
									{savingKey[p.id] ? 'Guardando...' : 'Guardar'}
								</button>
							</div>
						</div>

						<!-- Delete key -->
						{#if cfg}
							<div class="mt-4 flex justify-end">
								<button
									type="button"
									onclick={() => handleDeleteKey(p.id)}
									disabled={deletingKey[p.id]}
									class="font-sans text-xs text-red-500 transition-colors hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
								>
									{deletingKey[p.id] ? 'Eliminando...' : 'Eliminar key'}
								</button>
							</div>
						{/if}
					</section>
				{/each}
			{/if}
		</div>

	<!-- ── SECURITY TAB ── -->
	{:else if activeTab === 'security'}
		<div class="flex flex-col gap-6">

			{#if twoFaError}
				<div class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">
					{twoFaError}
				</div>
			{/if}

			<section class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper">
				<div class="flex items-start justify-between gap-4">
					<div>
						<h2 class="font-serif text-lg font-semibold text-ink dark:text-dark-ink">Verificación en dos pasos (2FA)</h2>
						<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
							Protege tu cuenta con una aplicación autenticadora como Google Authenticator o Authy.
						</p>
					</div>
					<span class="shrink-0 rounded-full px-3 py-1 font-sans text-xs font-semibold {twoFaEnabled
						? 'border border-green-300 text-green-700 dark:border-green-700 dark:text-green-400'
						: 'border border-paper-border text-ink-muted dark:border-dark-paper-border dark:text-dark-ink-muted'}">
						{twoFaEnabled ? 'Activado' : 'Desactivado'}
					</span>
				</div>

				{#if twoFaEnabled}
					<!-- 2FA is active — show disable option -->
					{#if twoFaStep === 'disabling'}
						<div class="mt-5 flex flex-col gap-3">
							<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
								Introduce tu contraseña para desactivar la verificación en dos pasos.
							</p>
							<input
								type="password"
								bind:value={twoFaPassword}
								placeholder="Contraseña actual"
								autocomplete="current-password"
								class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
							/>
							<div class="flex gap-2">
								<button
									type="button"
									onclick={handleDisableTwoFa}
									disabled={!twoFaPassword.trim() || twoFaLoading}
									class="rounded-md border border-red-300 px-4 py-2 font-sans text-sm text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
								>
									{twoFaLoading ? 'Desactivando...' : 'Confirmar desactivación'}
								</button>
								<button
									type="button"
									onclick={() => { twoFaStep = 'idle'; twoFaPassword = ''; twoFaError = ''; }}
									class="rounded-md border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
								>
									Cancelar
								</button>
							</div>
						</div>
					{:else}
						<div class="mt-5">
							<button
								type="button"
								onclick={() => { twoFaStep = 'disabling'; twoFaError = ''; }}
								class="rounded-md border border-red-300 px-4 py-2 font-sans text-sm text-red-600 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
							>
								Desactivar 2FA
							</button>
						</div>
					{/if}

				{:else if twoFaStep === 'idle' || twoFaStep === 'enabling'}
					<!-- Enable step 1: enter password -->
					<div class="mt-5 flex flex-col gap-3">
						{#if twoFaStep === 'idle'}
							<button
								type="button"
								onclick={() => { twoFaStep = 'enabling'; twoFaError = ''; }}
								class="self-start rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90"
							>
								Activar 2FA
							</button>
						{:else}
							<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
								Introduce tu contraseña para continuar.
							</p>
							<input
								type="password"
								bind:value={twoFaPassword}
								placeholder="Contraseña actual"
								autocomplete="current-password"
								class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
							/>
							<div class="flex gap-2">
								<button
									type="button"
									onclick={handleEnableTwoFa}
									disabled={!twoFaPassword.trim() || twoFaLoading}
									class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
								>
									{twoFaLoading ? 'Generando...' : 'Continuar'}
								</button>
								<button
									type="button"
									onclick={() => { twoFaStep = 'idle'; twoFaPassword = ''; twoFaError = ''; }}
									class="rounded-md border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
								>
									Cancelar
								</button>
							</div>
						{/if}
					</div>

				{:else if twoFaStep === 'qr'}
					<!-- Enable step 2: scan QR and enter code -->
					<div class="mt-5 flex flex-col gap-5">
						<div class="flex flex-col items-center gap-3 rounded-lg border border-paper-border bg-paper-ui p-5 dark:border-dark-paper-border dark:bg-dark-paper-ui">
							<p class="font-sans text-sm font-medium text-ink dark:text-dark-ink">
								Escanea con tu aplicación autenticadora
							</p>
							{#if twoFaQrDataUrl}
								<img src={twoFaQrDataUrl} alt="QR code para configurar 2FA" class="h-44 w-44 rounded" />
							{/if}
						</div>

						{#if twoFaBackupCodes.length > 0}
							<div class="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-900/10">
								<p class="mb-2 font-sans text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
									Códigos de respaldo — guárdalos en un lugar seguro
								</p>
								<div class="grid grid-cols-2 gap-1.5">
									{#each twoFaBackupCodes as code}
										<span class="rounded bg-amber-100 px-2 py-1 font-mono text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-300">{code}</span>
									{/each}
								</div>
							</div>
						{/if}

						<div class="flex flex-col gap-2">
							<label for="totp-verify" class="font-sans text-sm font-medium text-ink dark:text-dark-ink">
								Introduce el código de 6 dígitos para confirmar
							</label>
							<div class="flex gap-2">
								<input
									id="totp-verify"
									type="text"
									bind:value={twoFaCode}
									placeholder="000000"
									inputmode="numeric"
									pattern="[0-9]*"
									maxlength="6"
									autocomplete="one-time-code"
									class="w-36 rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-mono text-center text-sm tracking-widest text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
								/>
								<button
									type="button"
									onclick={handleVerifyTwoFa}
									disabled={twoFaCode.length !== 6 || twoFaLoading}
									class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
								>
									{twoFaLoading ? 'Verificando...' : 'Activar'}
								</button>
							</div>
						</div>
					</div>

				{:else if twoFaStep === 'done'}
					<!-- Success state -->
					<div class="mt-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 font-sans text-sm text-green-700 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-400">
						2FA activado correctamente. Tu cuenta está ahora protegida.
					</div>
				{/if}
			</section>
		</div>

	<!-- ── BILLING TAB ── -->
	{:else}
		<div class="flex flex-col gap-6">

			{#if billingError}
				<div class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">
					{billingError}
				</div>
			{/if}

			<!-- Current plan -->
			<section class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper">
				<div class="flex items-start justify-between gap-4">
					<div>
						<h2 class="font-serif text-lg font-semibold text-ink dark:text-dark-ink">Plan actual</h2>
						{#if loadingPlan}
							<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">Cargando...</p>
						{:else if planData}
							<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
								{#if planData.plan === 'free'}
									Estás en el plan gratuito.
								{:else}
									Suscripción activa.
									{#if planData.planCurrentPeriodEnd}
										Próxima renovación: {formatDate(planData.planCurrentPeriodEnd)}.
									{/if}
								{/if}
							</p>
						{/if}
					</div>
					{#if !loadingPlan && planData}
						<span class="shrink-0 rounded-full border border-accent/40 px-3 py-1 font-sans text-xs font-semibold uppercase tracking-wide text-accent">
							{planData.plan}
							{#if planData.planStatus && planData.planStatus !== 'active'}
								· {planData.planStatus}
							{/if}
						</span>
					{/if}
				</div>

				{#if !loadingPlan && planData && planData.plan !== 'free' && planData.stripeCustomerId}
					<div class="mt-4">
						<button
							type="button"
							onclick={handleManage}
							disabled={portalLoading}
							class="rounded-md border border-paper-border px-4 py-2 font-sans text-sm text-ink transition-colors hover:bg-paper-ui disabled:opacity-50 dark:border-dark-paper-border dark:text-dark-ink dark:hover:bg-dark-paper-ui"
						>
							{portalLoading ? 'Redirigiendo...' : 'Gestionar suscripción'}
						</button>
					</div>
				{/if}

				<div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
					{#each [
						{ label: 'Proyectos', value: 'Ilimitados' },
						{ label: 'Documentos', value: 'Ilimitados' },
						{ label: 'Colaboradores', value: '3 por proyecto' },
						{ label: 'Consultas IA', value: 'Incluidas (beta)' }
					] as item}
						<div class="rounded-lg border border-paper-border bg-paper-ui px-3 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui">
							<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">{item.label}</p>
							<p class="mt-0.5 font-sans text-sm font-medium text-ink dark:text-dark-ink">{item.value}</p>
						</div>
					{/each}
				</div>
			</section>

			<!-- Plans comparison -->
			<section class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper">
				<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">
					Planes disponibles
				</h2>
				<p class="mb-5 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
					Durante la beta todos los planes son gratuitos. Los precios definitivos se anunciarán antes del lanzamiento.
				</p>

				<div class="grid gap-4 sm:grid-cols-3">
					<!-- Free -->
					<div class="flex flex-col rounded-xl border-2 {currentPlanName === 'free' ? 'border-accent bg-accent/5' : 'border-paper-border dark:border-dark-paper-border'} p-5">
						<div class="mb-3 flex items-center justify-between">
							<span class="font-serif text-base font-semibold text-ink dark:text-dark-ink">Free</span>
							{#if currentPlanName === 'free'}
								<span class="rounded-full bg-accent px-2 py-0.5 font-sans text-xs font-semibold text-white">Actual</span>
							{/if}
						</div>
						<p class="mb-4 font-sans text-sm font-medium text-ink-muted dark:text-dark-ink-muted">
							Gratis durante la beta
						</p>
						<ul class="flex flex-1 flex-col gap-2 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
							{#each ['3 proyectos', '3 colaboradores por proyecto', 'IA básica (beta)', 'Historial 30 días'] as f}
								<li class="flex items-center gap-2">
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" class="shrink-0 text-accent" aria-hidden="true">
										<path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
									</svg>
									{f}
								</li>
							{/each}
						</ul>
					</div>

					<!-- Pro -->
					<div class="flex flex-col rounded-xl border-2 {currentPlanName === 'pro' ? 'border-accent bg-accent/5' : 'border-paper-border dark:border-dark-paper-border'} p-5">
						<div class="mb-3 flex items-center justify-between">
							<span class="font-serif text-base font-semibold text-ink dark:text-dark-ink">Pro</span>
							{#if currentPlanName === 'pro'}
								<span class="rounded-full bg-accent px-2 py-0.5 font-sans text-xs font-semibold text-white">Actual</span>
							{/if}
						</div>
						<p class="mb-4 font-sans text-sm font-medium text-ink-muted dark:text-dark-ink-muted">
							Gratis durante la beta
						</p>
						<ul class="flex flex-1 flex-col gap-2 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
							{#each ['Proyectos ilimitados', '10 colaboradores por proyecto', 'IA avanzada con sugerencias', 'Historial ilimitado', 'Exportación PDF / LaTeX'] as f}
								<li class="flex items-center gap-2">
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" class="shrink-0 text-accent" aria-hidden="true">
										<path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
									</svg>
									{f}
								</li>
							{/each}
						</ul>
						{#if currentPlanName !== 'pro'}
							<button
								type="button"
								onclick={() => handleUpgrade('pro')}
								disabled={checkoutLoading === 'pro'}
								class="mt-5 rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
							>
								{checkoutLoading === 'pro' ? 'Redirigiendo...' : 'Upgrade a Pro'}
							</button>
						{/if}
					</div>

					<!-- Team -->
					<div class="flex flex-col rounded-xl border-2 {currentPlanName === 'team' ? 'border-accent bg-accent/5' : 'border-paper-border dark:border-dark-paper-border'} p-5">
						<div class="mb-3 flex items-center justify-between">
							<span class="font-serif text-base font-semibold text-ink dark:text-dark-ink">Team</span>
							{#if currentPlanName === 'team'}
								<span class="rounded-full bg-accent px-2 py-0.5 font-sans text-xs font-semibold text-white">Actual</span>
							{/if}
						</div>
						<p class="mb-4 font-sans text-sm font-medium text-ink-muted dark:text-dark-ink-muted">
							Gratis durante la beta
						</p>
						<ul class="flex flex-1 flex-col gap-2 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
							{#each ['Todo lo de Pro', 'Colaboradores ilimitados', 'Panel de administración', 'SSO / SAML', 'Soporte prioritario'] as f}
								<li class="flex items-center gap-2">
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" class="shrink-0 text-accent" aria-hidden="true">
										<path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
									</svg>
									{f}
								</li>
							{/each}
						</ul>
						{#if currentPlanName !== 'team'}
							<button
								type="button"
								onclick={() => handleUpgrade('team')}
								disabled={checkoutLoading === 'team'}
								class="mt-5 rounded-md border border-accent px-4 py-2 font-sans text-sm font-medium text-accent transition-colors hover:bg-accent/5 disabled:opacity-50"
							>
								{checkoutLoading === 'team' ? 'Redirigiendo...' : 'Upgrade a Team'}
							</button>
						{/if}
					</div>
				</div>
			</section>

			<!-- Invoices -->
			<section class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper">
				<h2 class="mb-4 font-serif text-lg font-semibold text-ink dark:text-dark-ink">Facturas</h2>
				{#if planData?.stripeCustomerId}
					<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
						Accede al portal de Stripe para ver y descargar tus facturas.
					</p>
					<button
						type="button"
						onclick={handleManage}
						disabled={portalLoading}
						class="mt-3 rounded-md border border-paper-border px-4 py-2 font-sans text-sm text-ink transition-colors hover:bg-paper-ui disabled:opacity-50 dark:border-dark-paper-border dark:text-dark-ink dark:hover:bg-dark-paper-ui"
					>
						{portalLoading ? 'Redirigiendo...' : 'Ver facturas en Stripe'}
					</button>
				{:else}
					<div class="rounded-lg border border-dashed border-paper-border py-10 text-center dark:border-dark-paper-border">
						<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
							Sin facturas. Las facturas aparecerán aquí cuando tengas un plan de pago.
						</p>
					</div>
				{/if}
			</section>
		</div>
	{/if}

	<!-- Danger zone -->
	<div class="mt-10 rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-900 dark:bg-red-950/30">
		<h2 class="font-serif text-lg font-semibold text-red-700 dark:text-red-400">Zona de peligro</h2>
		<p class="mt-1 font-sans text-sm text-red-600 dark:text-red-500">
			Estas acciones son permanentes e irreversibles.
		</p>

		<div class="mt-4 flex items-center justify-between rounded-lg border border-red-200 bg-white p-4 dark:border-red-900 dark:bg-dark-paper">
			<div>
				<p class="font-sans text-sm font-medium text-ink dark:text-dark-ink">Eliminar cuenta</p>
				<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					Borra tu cuenta, todos tus proyectos, documentos y archivos de forma permanente.
				</p>
			</div>
			<button
				type="button"
				onclick={() => (showDeleteDialog = true)}
				class="ml-4 shrink-0 rounded-md border border-red-300 px-4 py-2 font-sans text-sm font-medium text-red-700 transition-colors hover:bg-red-100 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30"
			>
				Eliminar cuenta
			</button>
		</div>
	</div>
</div>

<!-- Delete account confirmation dialog -->
{#if showDeleteDialog}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
		role="dialog"
		aria-modal="true"
		aria-labelledby="delete-dialog-title"
	>
		<div class="w-full max-w-md rounded-2xl border border-paper-border bg-paper p-6 shadow-xl dark:border-dark-paper-border dark:bg-dark-paper">
			<h3 id="delete-dialog-title" class="font-serif text-xl font-semibold text-ink dark:text-dark-ink">
				¿Eliminar tu cuenta?
			</h3>
			<p class="mt-2 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				Esta acción borrará permanentemente tu cuenta y <strong>todos tus datos</strong>: proyectos,
				documentos, historial de versiones, comentarios y archivos. No se puede deshacer.
			</p>

			<div class="mt-5">
				<label for="delete-confirm" class="block font-sans text-sm font-medium text-ink dark:text-dark-ink">
					Escribe <span class="font-mono font-bold">{DELETE_KEYWORD}</span> para confirmar
				</label>
				<input
					id="delete-confirm"
					type="text"
					bind:value={deleteConfirmText}
					placeholder={DELETE_KEYWORD}
					class="mt-2 w-full rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-faint focus:border-red-400 focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
				/>
			</div>

			{#if deleteError}
				<p class="mt-3 font-sans text-sm text-red-600 dark:text-red-400">{deleteError}</p>
			{/if}

			<div class="mt-5 flex gap-3">
				<button
					type="button"
					onclick={() => { showDeleteDialog = false; deleteConfirmText = ''; deleteError = ''; }}
					disabled={deletingAccount}
					class="flex-1 rounded-md border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui disabled:opacity-50 dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
				>
					Cancelar
				</button>
				<button
					type="button"
					onclick={handleDeleteAccount}
					disabled={deleteConfirmText !== DELETE_KEYWORD || deletingAccount}
					class="flex-1 rounded-md bg-red-600 px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-40"
				>
					{deletingAccount ? 'Eliminando...' : 'Eliminar para siempre'}
				</button>
			</div>
		</div>
	</div>
{/if}
