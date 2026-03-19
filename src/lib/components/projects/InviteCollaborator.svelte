<script lang="ts">
	import { trpc } from '$lib/utils/trpc';

	type Role = 'author' | 'coauthor' | 'reviewer' | 'commenter';
	type Invitation = {
		id: string;
		invitedEmail: string;
		role: Role;
		status: string;
		expiresAt: Date;
	};

	let {
		projectId,
		invitations = [],
		oninvited
	}: {
		projectId: string;
		invitations?: Invitation[];
		oninvited?: () => void;
	} = $props();

	const roleOptions: { value: Role; label: string }[] = [
		{ value: 'author', label: 'Autor' },
		{ value: 'coauthor', label: 'Coautor' },
		{ value: 'reviewer', label: 'Revisor' },
		{ value: 'commenter', label: 'Comentarista' }
	];

	const roleLabel: Record<Role, string> = {
		author: 'Autor',
		coauthor: 'Coautor',
		reviewer: 'Revisor',
		commenter: 'Comentarista'
	};

	let email = $state('');
	let role: Role = $state('reviewer');
	let reqState: 'idle' | 'sending' | 'sent' | 'error' = $state('idle');
	let errorMsg = $state('');

	async function invite() {
		if (!email.trim()) return;
		reqState ='sending';
		errorMsg = '';
		try {
			await trpc.invitations.create.mutate({ projectId, invitedEmail: email.trim(), role });
			reqState ='sent';
			email = '';
			oninvited?.();
			setTimeout(() => (reqState ='idle'), 3000);
		} catch (e: unknown) {
			reqState ='error';
			errorMsg = e instanceof Error ? e.message : 'Error al enviar la invitación';
		}
	}

	async function cancel(invitationId: string) {
		await trpc.invitations.cancel.mutate(invitationId);
		oninvited?.();
	}
</script>

<div class="font-sans">
	<h2 class="font-serif text-lg font-semibold text-ink dark:text-dark-ink">
		Invitar colaboradores
	</h2>
	<p class="mt-1 text-sm text-ink-muted dark:text-dark-ink-muted">
		El colaborador recibirá un email con un enlace para unirse al proyecto.
	</p>

	<div class="mt-4 flex flex-col gap-3 sm:flex-row">
		<input
			type="email"
			bind:value={email}
			placeholder="email@ejemplo.com"
			class="flex-1 rounded-md border border-paper-border bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
		/>
		<select
			bind:value={role}
			class="rounded-md border border-paper-border bg-paper px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
		>
			{#each roleOptions as opt (opt.value)}
				<option value={opt.value}>{opt.label}</option>
			{/each}
		</select>
		<button
			onclick={invite}
			disabled={reqState ==='sending' || !email.trim()}
			class="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
		>
			{reqState ==='sending' ? 'Enviando...' : 'Invitar'}
		</button>
	</div>

	{#if reqState ==='sent'}
		<p class="mt-2 text-sm text-green-600">Invitación enviada correctamente.</p>
	{:else if reqState ==='error'}
		<p class="mt-2 text-sm text-red-600">{errorMsg}</p>
	{/if}

	{#if invitations.length > 0}
		<div class="mt-6">
			<h3 class="mb-3 text-sm font-medium text-ink-muted dark:text-dark-ink-muted">
				Invitaciones pendientes
			</h3>
			<ul class="flex flex-col gap-2">
				{#each invitations as inv (inv.id)}
					<li
						class="flex items-center justify-between rounded-lg border border-paper-border px-4 py-3 dark:border-dark-paper-border"
					>
						<div>
							<p class="text-sm text-ink dark:text-dark-ink">{inv.invitedEmail}</p>
							<p class="mt-0.5 text-xs text-ink-faint dark:text-dark-ink-faint">
								{roleLabel[inv.role]} · expira {new Intl.DateTimeFormat('es', {
									day: 'numeric',
									month: 'short'
								}).format(new Date(inv.expiresAt))}
							</p>
						</div>
						<button
							onclick={() => cancel(inv.id)}
							class="text-xs text-ink-faint transition-colors hover:text-red-600 dark:text-dark-ink-faint"
						>
							Cancelar
						</button>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>
