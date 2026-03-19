<script lang="ts">
	import type { PageData } from './$types';
	import { trpc } from '$lib/utils/trpc';
	import { onMount } from 'svelte';

	let { data }: { data: PageData } = $props();

	// Profile form state
	let name = $state(data.user.name);
	let email = $state(data.user.email);
	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');

	// Active section
	let activeTab: 'profile' | 'billing' | 'ai' = $state('profile');

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
	type AiStatus = { configured: boolean; enabled: boolean; provider: string | null; updatedAt: Date | null };
	let aiStatus = $state<AiStatus | null>(null);
	let loadingAi = $state(false);
	let aiApiKey = $state('');
	let savingKey = $state(false);
	let togglingEnabled = $state(false);
	let deletingKey = $state(false);
	let aiError = $state('');
	let aiSuccess = $state('');

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

	async function handleSaveKey() {
		if (!aiApiKey.trim()) return;
		savingKey = true;
		aiError = '';
		aiSuccess = '';
		try {
			await trpc.aiConfig.saveApiKey.mutate({ apiKey: aiApiKey.trim(), provider: 'openrouter' });
			aiApiKey = '';
			aiSuccess = 'API key guardada correctamente.';
			await loadAiStatus();
		} catch (e: unknown) {
			aiError = e instanceof Error ? e.message : 'Error al guardar la API key.';
		} finally {
			savingKey = false;
		}
	}

	async function handleToggleEnabled(enabled: boolean) {
		togglingEnabled = true;
		aiError = '';
		aiSuccess = '';
		try {
			await trpc.aiConfig.toggleEnabled.mutate(enabled);
			if (aiStatus) aiStatus = { ...aiStatus, enabled };
		} catch (e: unknown) {
			aiError = e instanceof Error ? e.message : 'Error al cambiar el estado.';
		} finally {
			togglingEnabled = false;
		}
	}

	async function handleDeleteKey() {
		if (!confirm('¿Eliminar la API key almacenada? Perderás acceso al asistente IA hasta que añadas una nueva.')) return;
		deletingKey = true;
		aiError = '';
		aiSuccess = '';
		try {
			await trpc.aiConfig.deleteApiKey.mutate();
			aiSuccess = 'API key eliminada.';
			await loadAiStatus();
		} catch (e: unknown) {
			aiError = e instanceof Error ? e.message : 'Error al eliminar la API key.';
		} finally {
			deletingKey = false;
		}
	}

	$effect(() => {
		if (activeTab === 'ai' && aiStatus === null) loadAiStatus();
	});

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

			<!-- Status card -->
			<section class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper">
				<div class="flex items-start justify-between gap-4">
					<div>
						<h2 class="font-serif text-lg font-semibold text-ink dark:text-dark-ink">Asistente de investigación</h2>
						<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
							El asistente del chat usa tu propia API key de OpenRouter (BYOK).
							Tu key se cifra con AWS KMS y nunca se expone en claro.
						</p>
					</div>
					{#if !loadingAi && aiStatus?.configured}
						<span class="shrink-0 rounded-full px-3 py-1 font-sans text-xs font-semibold {aiStatus.enabled
							? 'border border-green-300 text-green-700 dark:border-green-700 dark:text-green-400'
							: 'border border-paper-border text-ink-muted dark:border-dark-paper-border dark:text-dark-ink-muted'}">
							{aiStatus.enabled ? 'Activo' : 'Deshabilitado'}
						</span>
					{/if}
				</div>

				{#if loadingAi}
					<p class="mt-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">Cargando...</p>
				{:else if aiStatus?.configured}
					<!-- Key configured -->
					<div class="mt-5 flex flex-col gap-4">
						<div class="rounded-lg border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui">
							<div class="flex items-center justify-between">
								<div>
									<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">Proveedor</p>
									<p class="mt-0.5 font-sans text-sm font-medium text-ink dark:text-dark-ink">OpenRouter</p>
								</div>
								<div class="text-right">
									<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">Última actualización</p>
									<p class="mt-0.5 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
										{formatDate(aiStatus.updatedAt)}
									</p>
								</div>
							</div>
						</div>

						<!-- Toggle enabled -->
						<div class="flex items-center justify-between">
							<div>
								<p class="font-sans text-sm font-medium text-ink dark:text-dark-ink">Asistente habilitado</p>
								<p class="font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
									Desactívalo sin eliminar la key.
								</p>
							</div>
							<button
								type="button"
								role="switch"
								aria-checked={aiStatus.enabled}
								aria-label={aiStatus.enabled ? 'Deshabilitar asistente IA' : 'Habilitar asistente IA'}
								onclick={() => handleToggleEnabled(!aiStatus!.enabled)}
								disabled={togglingEnabled}
								class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50
									{aiStatus.enabled ? 'bg-accent' : 'bg-paper-border dark:bg-dark-paper-border'}"
							>
								<span
									class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200
										{aiStatus.enabled ? 'translate-x-5' : 'translate-x-0'}"
								></span>
							</button>
						</div>
					</div>
				{/if}
			</section>

			<!-- Add / replace key -->
			<section class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper">
				<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">
					{aiStatus?.configured ? 'Reemplazar API key' : 'Añadir API key'}
				</h2>
				<p class="mb-5 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
					Obtén tu key en
					<a
						href="https://openrouter.ai/keys"
						target="_blank"
						rel="noopener noreferrer"
						class="text-accent underline underline-offset-2"
					>openrouter.ai/keys</a>.
					La key se cifra con AWS KMS antes de almacenarse.
				</p>

				<div class="flex gap-3">
					<input
						type="password"
						bind:value={aiApiKey}
						placeholder="sk-or-v1-..."
						autocomplete="off"
						class="flex-1 rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-mono text-sm text-ink placeholder:font-sans placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
					/>
					<button
						type="button"
						onclick={handleSaveKey}
						disabled={!aiApiKey.trim() || savingKey}
						class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
					>
						{savingKey ? 'Guardando...' : 'Guardar'}
					</button>
				</div>
			</section>

			<!-- Danger: delete key -->
			{#if aiStatus?.configured}
				<section class="rounded-xl border border-red-200 bg-paper p-6 dark:border-red-900/40 dark:bg-dark-paper">
					<h2 class="mb-1 font-serif text-lg font-semibold text-red-600 dark:text-red-400">
						Eliminar API key
					</h2>
					<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
						La key se elimina permanentemente de nuestros servidores.
					</p>
					<button
						type="button"
						onclick={handleDeleteKey}
						disabled={deletingKey}
						class="rounded-md border border-red-300 px-4 py-2 font-sans text-sm text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
					>
						{deletingKey ? 'Eliminando...' : 'Eliminar key'}
					</button>
				</section>
			{/if}
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
				<h2 class="mb-5 font-serif text-lg font-semibold text-ink dark:text-dark-ink">
					Planes disponibles
				</h2>

				<div class="grid gap-4 sm:grid-cols-3">
					<!-- Free -->
					<div class="flex flex-col rounded-xl border-2 {currentPlanName === 'free' ? 'border-accent bg-accent/5' : 'border-paper-border dark:border-dark-paper-border'} p-5">
						<div class="mb-3 flex items-center justify-between">
							<span class="font-serif text-base font-semibold text-ink dark:text-dark-ink">Free</span>
							{#if currentPlanName === 'free'}
								<span class="rounded-full bg-accent px-2 py-0.5 font-sans text-xs font-semibold text-white">Actual</span>
							{/if}
						</div>
						<p class="mb-4 font-serif text-2xl font-semibold text-ink dark:text-dark-ink">
							0€<span class="font-sans text-sm font-normal text-ink-muted">/mes</span>
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
						<p class="mb-4 font-serif text-2xl font-semibold text-ink dark:text-dark-ink">
							9€<span class="font-sans text-sm font-normal text-ink-muted">/mes</span>
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
						<p class="mb-4 font-serif text-2xl font-semibold text-ink dark:text-dark-ink">
							29€<span class="font-sans text-sm font-normal text-ink-muted">/mes</span>
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
