<script lang="ts">
	import type { LayoutData } from './$types';
	import { workspaceStore } from '$lib/stores/workspace.svelte';
	import { trpc } from '$lib/utils/trpc';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import Banner from '$lib/components/ui/Banner.svelte';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
	const projectId = $derived(page.params.id!);

	$effect(() => {
		workspaceStore.syncToOrg(data.projectOrgId);
	});

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
	<Banner variant="danger">
		This project is scheduled for deletion in
		<strong>{daysLeft(scheduledDeleteAt)} day{daysLeft(scheduledDeleteAt) === 1 ? '' : 's'}</strong>
		({scheduledDeleteAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}). Export
		your documents before then.
		{#snippet action()}
			{#if data.isOwner}
				<button
					type="button"
					onclick={handleCancelDeletion}
					disabled={cancellingDeletion}
					class="rounded-md border border-danger-border bg-paper px-3 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger-bg disabled:opacity-50"
				>
					{cancellingDeletion ? 'Cancelling…' : 'Cancel deletion'}
				</button>
			{/if}
		{/snippet}
	</Banner>
{/if}

{@render children()}
