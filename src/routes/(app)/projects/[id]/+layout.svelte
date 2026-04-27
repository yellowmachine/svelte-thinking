<script lang="ts">
	import type { LayoutData } from './$types';
	import { workspaceStore } from '$lib/stores/workspace.svelte';
	import { trpc } from '$lib/utils/trpc';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
	const projectId = $derived($page.params.id!);

	$effect(() => { workspaceStore.syncToOrg(data.projectOrgId); });

	let cancellingDeletion = $state(false);

	const scheduledDeleteAt = $derived(
		data.scheduledDeleteAt ? new Date(data.scheduledDeleteAt) : null
	);

	function daysLeft(date: Date): number {
		return Math.max(0, Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
	}

	async function handleCancelDeletion() {
		cancellingDeletion = true;
		try {
			await trpc.projects.cancelDeletion.mutate(projectId);
			await invalidateAll();
		} finally {
			cancellingDeletion = false;
		}
	}
</script>

{#if scheduledDeleteAt}
	<div class="border-b border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/40 dark:bg-red-950/30">
		<div class="mx-auto flex max-w-5xl items-center justify-between gap-4">
			<div class="flex items-center gap-2.5">
				<svg class="h-4 w-4 shrink-0 text-red-500 dark:text-red-400" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
						stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
				<p class="font-sans text-sm text-red-800 dark:text-red-300">
					This project is scheduled for deletion in
					<strong>{daysLeft(scheduledDeleteAt)} day{daysLeft(scheduledDeleteAt) === 1 ? '' : 's'}</strong>
					({scheduledDeleteAt.toLocaleDateString('en', { day: 'numeric', month: 'long' })}).
					Export your documents before the deadline.
				</p>
			</div>
			{#if data.isOwner}
				<button
					type="button"
					onclick={handleCancelDeletion}
					disabled={cancellingDeletion}
					class="shrink-0 rounded-md border border-red-300 bg-white px-3 py-1.5 font-sans text-xs font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-950/50"
				>
					{cancellingDeletion ? 'Cancelling…' : 'Cancel deletion'}
				</button>
			{/if}
		</div>
	</div>
{/if}

{@render children()}
