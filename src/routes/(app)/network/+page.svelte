<script lang="ts">
	import { trpc } from '$lib/utils/trpc';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';

	const roleLabel: Record<string, string> = {
		author: 'Autor',
		coauthor: 'Coautor',
		reviewer: 'Revisor',
		commenter: 'Comentarista'
	};

	let { data }: { data: PageData } = $props();

	let accepting = $state<string | null>(null);
	let error = $state('');

	async function accept(token: string) {
		accepting = token;
		error = '';
		try {
			await trpc.invitations.accept.mutate(token);
			await invalidateAll();
		} catch (e: unknown) {
			error = e instanceof Error ? e.message : 'Error al aceptar la invitación';
		} finally {
			accepting = null;
		}
	}
</script>

<div class="mx-auto max-w-2xl px-6 py-10">
	<h1 class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">Red</h1>

	<section class="mt-8">
		<h2 class="mb-4 font-sans text-xs font-semibold uppercase tracking-wide text-ink-faint dark:text-dark-ink-faint">
			Invitaciones pendientes
		</h2>

		{#if data.invitations.length === 0}
			<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				No tienes invitaciones pendientes.
			</p>
		{:else}
			<ul class="flex flex-col gap-3">
				{#each data.invitations as inv (inv.id)}
					<li class="flex items-center justify-between rounded-xl border border-paper-border bg-paper px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper">
						<div class="min-w-0">
							<p class="truncate font-sans text-sm font-medium text-ink dark:text-dark-ink">
								{inv.projectTitle}
							</p>
							<p class="mt-0.5 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
								{roleLabel[inv.role] ?? inv.role} · expira {new Intl.DateTimeFormat('es', {
									day: 'numeric',
									month: 'short'
								}).format(new Date(inv.expiresAt))}
							</p>
						</div>
						<button
							onclick={() => accept(inv.token)}
							disabled={accepting === inv.token}
							class="ml-4 shrink-0 rounded-lg bg-accent px-4 py-1.5 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
						>
							{accepting === inv.token ? 'Aceptando…' : 'Aceptar'}
						</button>
					</li>
				{/each}
			</ul>

			{#if error}
				<p class="mt-3 font-sans text-sm text-red-600">{error}</p>
			{/if}
		{/if}
	</section>
</div>
