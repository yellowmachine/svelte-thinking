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
	let activeTab: 'profile' | 'billing' = $state('profile');

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
</div>
