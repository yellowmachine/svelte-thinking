<script lang="ts">
	import { onMount } from 'svelte';
	import { offlineDb, type PendingEdit } from '$lib/offline.db';
	import { connectivity } from '$lib/stores/connectivity.svelte';
	import { onlineStore } from '$lib/stores/online.svelte';

	let edits = $state<PendingEdit[]>([]);
	let loading = $state(true);
	let retrying = $state(false);

	async function load() {
		loading = true;
		edits = await offlineDb.pendingEdits.orderBy('savedAt').reverse().toArray();
		loading = false;
	}

	onMount(load);

	async function retryAll() {
		retrying = true;
		await connectivity.syncAll();
		await load();
		retrying = false;
	}

	async function discardFailed() {
		await offlineDb.pendingEdits.where('status').anyOf(['failed', 'writer_lost']).delete();
		await load();
	}

	const statusLabel: Record<string, string> = {
		pending: 'Pending',
		synced: 'Synced',
		failed: 'Failed',
		writer_lost: 'Writer lost'
	};

	const statusStyle: Record<string, string> = {
		pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
		synced: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
		failed: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
		writer_lost: 'bg-paper-border text-ink-muted dark:bg-dark-paper-border dark:text-dark-ink-muted'
	};

	const hasPending = $derived(edits.some((e) => e.status === 'pending' || e.status === 'failed'));
</script>

<div class="mx-auto max-w-2xl px-6 py-10">
	<div class="mb-6 flex items-center justify-between">
		<div>
			<h1 class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">Sync log</h1>
			<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				Offline edits and their sync status.
			</p>
		</div>
		<div class="flex gap-2">
			{#if hasPending && onlineStore.online}
				<button
					onclick={retryAll}
					disabled={retrying || connectivity.syncState === 'syncing'}
					class="rounded-md bg-accent px-3 py-1.5 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
				>
					{retrying || connectivity.syncState === 'syncing' ? 'Syncing…' : 'Retry all'}
				</button>
			{/if}
			<button
				onclick={discardFailed}
				disabled={!edits.some((e) => e.status === 'failed' || e.status === 'writer_lost')}
				class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui disabled:opacity-40 dark:border-dark-paper-border dark:text-dark-ink-muted"
			>
				Discard failed
			</button>
		</div>
	</div>

	{#if connectivity.syncErrors.length > 0}
		<div
			class="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/40 dark:bg-red-900/10"
		>
			<p class="font-sans text-sm font-medium text-red-600 dark:text-red-400">Last sync errors:</p>
			<ul class="mt-1 space-y-1">
				{#each connectivity.syncErrors as err}
					<li class="font-sans text-xs text-red-500 dark:text-red-400">
						Document {err.documentId.slice(0, 8)}… — {err.message}
					</li>
				{/each}
			</ul>
			<button
				onclick={() => connectivity.clearErrors()}
				class="mt-2 font-sans text-xs text-red-500 underline hover:text-red-600 dark:text-red-400"
			>
				Dismiss
			</button>
		</div>
	{/if}

	{#if loading}
		<p class="font-sans text-sm text-ink-faint dark:text-dark-ink-faint">Loading…</p>
	{:else if edits.length === 0}
		<div
			class="rounded-xl border border-paper-border bg-paper p-10 text-center dark:border-dark-paper-border dark:bg-dark-paper"
		>
			<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				No offline edits recorded.
			</p>
		</div>
	{:else}
		<div
			class="overflow-hidden rounded-xl border border-paper-border bg-paper dark:border-dark-paper-border dark:bg-dark-paper"
		>
			{#each edits as edit, i (edit.id)}
				<div
					class="flex items-center gap-3 px-4 py-3 {i > 0
						? 'border-t border-paper-border dark:border-dark-paper-border'
						: ''}"
				>
					<div class="min-w-0 flex-1">
						<p class="font-mono text-xs text-ink-muted dark:text-dark-ink-muted">
							{edit.documentId}
						</p>
						<p class="mt-0.5 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
							{new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(
								edit.savedAt
							)}
							· {edit.content.length} chars
						</p>
					</div>
					<span
						class="shrink-0 rounded-full px-2.5 py-0.5 font-sans text-xs font-medium {statusStyle[
							edit.status
						] ?? ''}"
					>
						{statusLabel[edit.status] ?? edit.status}
					</span>
				</div>
			{/each}
		</div>
	{/if}
</div>
