<script lang="ts">
	import TutorialManager from './TutorialManager.svelte';
	import { networkTutorialSteps } from '$lib/tutorials/network';

	interface Props {
		completed?: boolean;
	}

	let { completed = false }: Props = $props();

	const mockInvitations = [
		{
			id: '1',
			token: 'tok-1',
			projectTitle: 'Climate Policy and Carbon Markets',
			role: 'reviewer',
			invitedByName: 'Ana García',
			expiresAt: '10 Jun 2026'
		},
		{
			id: '2',
			token: 'tok-2',
			projectTitle: 'Urban Biodiversity Field Study',
			role: 'coauthor',
			invitedByName: 'James Okafor',
			expiresAt: '15 Jun 2026'
		}
	];

	const roleLabel: Record<string, string> = {
		author: 'Author',
		coauthor: 'Co-author',
		reviewer: 'Reviewer',
		commenter: 'Commenter'
	};
</script>

<div class="min-h-screen bg-paper-ui dark:bg-dark-paper-ui">
	<div class="mx-auto max-w-2xl px-6 py-10">
		<h1
			data-tutorial="network-title"
			class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink"
		>
			Network
		</h1>

		<section data-tutorial="network-invitations" class="mt-8">
			<h2
				class="mb-4 font-sans text-xs font-semibold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint"
			>
				Pending invitations
			</h2>

			<ul class="flex flex-col gap-3">
				{#each mockInvitations as inv (inv.id)}
					<li
						class="flex items-center justify-between gap-4 rounded-xl border border-paper-border bg-paper px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper"
					>
						<div class="min-w-0 flex-1">
							<p class="truncate font-sans text-sm font-medium text-ink dark:text-dark-ink">
								{inv.projectTitle}
							</p>
							<p class="mt-0.5 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
								{roleLabel[inv.role] ?? inv.role} · invited by {inv.invitedByName} · expires {inv.expiresAt}
							</p>
						</div>
						<div class="flex shrink-0 items-center gap-2">
							<button
								type="button"
								class="rounded-lg border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-dark-paper-border dark:text-dark-ink-muted"
							>
								Decline
							</button>
							<button
								data-tutorial="network-accept"
								type="button"
								class="rounded-lg bg-accent px-4 py-1.5 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90"
							>
								Accept
							</button>
						</div>
					</li>
				{/each}
			</ul>
		</section>

		{#if completed}
			<p class="mt-8 font-sans text-sm text-ink-muted italic dark:text-dark-ink-muted">
				Tutorial already completed — the tour will not launch.
			</p>
		{/if}
	</div>

	<TutorialManager
		slug="network"
		completedTutorials={completed ? ['network'] : []}
		steps={networkTutorialSteps}
	/>
</div>
