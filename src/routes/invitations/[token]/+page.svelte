<script lang="ts">
	import { browser } from '$app/environment';
	import { trpc } from '$lib/utils/trpc';

	type Role = 'owner' | 'author' | 'coauthor' | 'reviewer' | 'commenter';
	type Status = 'pending' | 'accepted' | 'expired' | 'cancelled';

	let {
		data
	}: {
		data: {
			invitation: {
				id: string;
				role: Role;
				status: Status;
				expiresAt: Date;
				projectId: string;
				invitedEmail: string;
				projectTitle: string | null;
				projectDescription: string | null;
			};
			token: string;
			user: { id: string; name: string; email: string } | null;
		};
	} = $props();

	const roleLabel: Record<Role, string> = {
		owner: 'Owner',
		author: 'Autor',
		coauthor: 'Coautor',
		reviewer: 'Revisor',
		commenter: 'Comentarista'
	};

	let reqState: 'idle' | 'accepting' | 'success' | 'error' = $state('idle');
	let errorMsg = $state('');

	let isExpired = $derived(new Date(data.invitation.expiresAt) < new Date());
	let isAlreadyAccepted = $derived(data.invitation.status === 'accepted');
	let canAccept = $derived(
		!isExpired && !isAlreadyAccepted && data.invitation.status === 'pending' && !!data.user
	);

	function navigate(path: string) {
		if (browser) window.location.href = path;
	}

	async function accept() {
		reqState = 'accepting';
		try {
			const result = await trpc.invitations.accept.mutate(data.token);
			reqState = 'success';
			if (browser) {
				setTimeout(() => (window.location.href = `/projects/${result.projectId}`), 1500);
			}
		} catch (e: unknown) {
			reqState = 'error';
			errorMsg = e instanceof Error ? e.message : 'Error al aceptar la invitación';
		}
	}
</script>

<div class="flex min-h-screen items-center justify-center bg-paper-ui px-4 dark:bg-dark-paper-ui">
	<div class="w-full max-w-md">
		<div
			class="rounded-2xl border border-paper-border bg-paper p-8 dark:border-dark-paper-border dark:bg-dark-paper"
		>
			{#if reqState === 'success'}
				<div class="text-center">
					<div
						class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100"
					>
						<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
							<path
								d="M5 13l4 4L19 7"
								stroke="#16a34a"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					</div>
					<h1 class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">
						¡Bienvenido al proyecto!
					</h1>
					<p class="mt-2 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
						Redirigiendo al proyecto...
					</p>
				</div>

			{:else if isAlreadyAccepted}
				<div class="text-center">
					<h1 class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">
						Invitación ya aceptada
					</h1>
					<p class="mt-2 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
						Ya eres colaborador de este proyecto.
					</p>
					<button
						onclick={() => navigate(`/projects/${data.invitation.projectId}`)}
						class="mt-6 inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover"
					>
						Ir al proyecto
					</button>
				</div>

			{:else if isExpired || data.invitation.status === 'cancelled'}
				<div class="text-center">
					<div
						class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-paper-border dark:bg-dark-paper-border"
					>
						<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
							<circle
								cx="12"
								cy="12"
								r="9"
								stroke="currentColor"
								stroke-width="1.5"
								class="text-ink-faint dark:text-dark-ink-faint"
							/>
							<path
								d="M12 8v4M12 16h.01"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
								class="text-ink-faint dark:text-dark-ink-faint"
							/>
						</svg>
					</div>
					<h1 class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">
						Invitación expirada
					</h1>
					<p class="mt-2 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
						Este enlace ya no es válido. Solicita una nueva invitación al propietario del proyecto.
					</p>
				</div>

			{:else}
				<div
					class="mb-1 font-sans text-xs font-medium uppercase tracking-widest text-ink-faint dark:text-dark-ink-faint"
				>
					Invitación a colaborar
				</div>
				<h1 class="mt-2 font-serif text-2xl font-semibold text-ink dark:text-dark-ink">
					{data.invitation.projectTitle ?? 'Proyecto sin título'}
				</h1>
				{#if data.invitation.projectDescription}
					<p class="mt-2 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
						{data.invitation.projectDescription}
					</p>
				{/if}

				<div
					class="mt-5 flex items-center gap-3 rounded-lg bg-paper-ui px-4 py-3 dark:bg-dark-paper-ui"
				>
					<div
						class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent font-sans text-xs font-semibold text-white"
					>
						{data.invitation.invitedEmail[0].toUpperCase()}
					</div>
					<div>
						<p class="font-sans text-sm text-ink dark:text-dark-ink">
							{data.invitation.invitedEmail}
						</p>
						<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
							Rol: <span class="font-medium text-accent">{roleLabel[data.invitation.role]}</span>
						</p>
					</div>
				</div>

				{#if reqState === 'error'}
					<p class="mt-4 rounded-lg bg-red-50 px-4 py-3 font-sans text-sm text-red-700">
						{errorMsg}
					</p>
				{/if}

				<div class="mt-6 flex flex-col gap-3">
					{#if !data.user}
						<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
							Debes iniciar sesión para aceptar esta invitación.
						</p>
						<button
							onclick={() => navigate(`/login?redirect=/invitations/${data.token}`)}
							class="flex items-center justify-center rounded-md bg-accent px-4 py-2.5 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover"
						>
							Iniciar sesión para aceptar
						</button>
					{:else if canAccept}
						<button
							onclick={accept}
							disabled={reqState === 'accepting'}
							class="flex items-center justify-center rounded-md bg-accent px-4 py-2.5 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
						>
							{reqState === 'accepting' ? 'Aceptando...' : 'Aceptar invitación'}
						</button>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>
