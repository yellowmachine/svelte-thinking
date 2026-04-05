<script lang="ts">
	import { trpc } from '$lib/utils/trpc';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';

	const roleLabel: Record<string, string> = {
		author: 'Author',
		coauthor: 'Co-author',
		reviewer: 'Reviewer',
		commenter: 'Commenter'
	};

	let { data }: { data: PageData } = $props();

	let accepting = $state<string | null>(null);
	let declining = $state<string | null>(null);
	let error = $state('');

	async function accept(token: string) {
		accepting = token;
		error = '';
		try {
			await trpc.invitations.accept.mutate(token);
			await invalidateAll();
		} catch (e: unknown) {
			error = e instanceof Error ? e.message : 'Error accepting invitation';
		} finally {
			accepting = null;
		}
	}

	async function decline(id: string) {
		declining = id;
		error = '';
		try {
			await trpc.invitations.decline.mutate(id);
			await invalidateAll();
		} catch (e: unknown) {
			error = e instanceof Error ? e.message : 'Error declining invitation';
		} finally {
			declining = null;
		}
	}
</script>

<div class="mx-auto max-w-2xl px-6 py-10">
	<h1 class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">Network</h1>

	<section class="mt-8">
		<h2 class="mb-4 font-sans text-xs font-semibold uppercase tracking-wide text-ink-faint dark:text-dark-ink-faint">
			Pending invitations
		</h2>

		{#if data.invitations.length === 0}
			<div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-paper-border py-12 dark:border-dark-paper-border">
				<svg width="28" height="28" viewBox="0 0 24 24" fill="none" class="mb-2 text-ink-faint dark:text-dark-ink-faint">
					<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
					<circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="1.5"/>
					<path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
				<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
					No pending invitations.
				</p>
			</div>
		{:else}
			<ul class="flex flex-col gap-3">
				{#each data.invitations as inv (inv.id)}
					<li class="flex items-center justify-between gap-4 rounded-xl border border-paper-border bg-paper px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper">
						<div class="min-w-0 flex-1">
							<p class="truncate font-sans text-sm font-medium text-ink dark:text-dark-ink">
								{inv.projectTitle ?? 'Untitled project'}
							</p>
							<p class="mt-0.5 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
								{roleLabel[inv.role] ?? inv.role}
								{#if inv.invitedByName}
									· invited by {inv.invitedByName}
								{/if}
								· expires {new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' }).format(new Date(inv.expiresAt))}
							</p>
						</div>
						<div class="flex shrink-0 items-center gap-2">
							<button
								onclick={() => decline(inv.id)}
								disabled={declining === inv.id || accepting === inv.token}
								class="rounded-lg border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-red-900/10 dark:hover:text-red-400"
							>
								{declining === inv.id ? 'Declining…' : 'Decline'}
							</button>
							<button
								onclick={() => accept(inv.token)}
								disabled={accepting === inv.token || declining === inv.id}
								class="rounded-lg bg-accent px-4 py-1.5 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
							>
								{accepting === inv.token ? 'Accepting…' : 'Accept'}
							</button>
						</div>
					</li>
				{/each}
			</ul>

			{#if error}
				<p class="mt-3 font-sans text-sm text-red-600 dark:text-red-400">{error}</p>
			{/if}
		{/if}
	</section>
</div>
