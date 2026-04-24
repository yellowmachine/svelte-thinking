<script lang="ts">
	import { onMount } from 'svelte';
	import { pouchStore, type OfflineDoc } from '$lib/offline/pouch.svelte';
	import { onlineStore } from '$lib/stores/online.svelte';

	let docs = $state<OfflineDoc[]>([]);
	let loading = $state(true);

	async function load() {
		loading = true;
		docs = await pouchStore.listDocuments();
		loading = false;
	}

	onMount(load);

	const statusLabel: Record<string, string> = {
		initializing: 'Initializing',
		syncing: 'Syncing',
		synced: 'Synced',
		error: 'Error',
		offline: 'Offline'
	};

	const statusStyle: Record<string, string> = {
		initializing: 'bg-paper-border text-ink-muted dark:bg-dark-paper-border dark:text-dark-ink-muted',
		syncing: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
		synced: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
		error: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
		offline: 'bg-paper-border text-ink-muted dark:bg-dark-paper-border dark:text-dark-ink-muted'
	};
</script>

<div class="mx-auto max-w-2xl px-6 py-10">
	<div class="mb-6 flex items-center justify-between">
		<div>
			<h1 class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">Sync log</h1>
			<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				Offline document cache and sync status.
			</p>
		</div>
		<div class="flex items-center gap-2">
			<span class="rounded-full px-2.5 py-0.5 font-sans text-xs font-medium {statusStyle[pouchStore.status] ?? ''}">
				{statusLabel[pouchStore.status] ?? pouchStore.status}
			</span>
			<button
				onclick={load}
				class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui disabled:opacity-40 dark:border-dark-paper-border dark:text-dark-ink-muted"
			>
				Refresh
			</button>
		</div>
	</div>

	{#if !onlineStore.online}
		<div class="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-900/10">
			<p class="font-sans text-sm text-amber-700 dark:text-amber-400">
				Offline — changes are saved locally and will sync automatically when you reconnect.
			</p>
		</div>
	{/if}

	{#if loading}
		<p class="font-sans text-sm text-ink-faint dark:text-dark-ink-faint">Loading…</p>
	{:else if docs.length === 0}
		<div class="rounded-xl border border-paper-border bg-paper p-10 text-center dark:border-dark-paper-border dark:bg-dark-paper">
			<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">No documents cached offline.</p>
		</div>
	{:else}
		<div class="overflow-hidden rounded-xl border border-paper-border bg-paper dark:border-dark-paper-border dark:bg-dark-paper">
			{#each docs as doc, i (doc._id)}
				<div class="flex items-center gap-3 px-4 py-3 {i > 0 ? 'border-t border-paper-border dark:border-dark-paper-border' : ''}">
					<div class="min-w-0 flex-1">
						<p class="truncate font-sans text-sm text-ink dark:text-dark-ink">{doc.title}</p>
						<p class="mt-0.5 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
							{new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(doc.updatedAt))}
							· {doc.content.length} chars
						</p>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
