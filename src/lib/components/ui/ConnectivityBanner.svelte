<script lang="ts">
	import { onlineStore } from '$lib/stores/online.svelte';
	import { connectivity } from '$lib/stores/connectivity.svelte';
	import { flash } from '$lib/stores/flash.svelte';

	// Visible when offline, syncing, error, or flash message is showing
	const visible = $derived(
		!onlineStore.online ||
		connectivity.syncState === 'syncing' ||
		connectivity.syncState === 'error' ||
		flash.value !== null
	);

	type Variant = 'offline' | 'syncing' | 'error' | 'success' | 'info';

	const variant = $derived((): Variant => {
		if (!onlineStore.online) return 'offline';
		if (connectivity.syncState === 'syncing') return 'syncing';
		if (connectivity.syncState === 'error') return 'error';
		if (flash.value) return flash.value.type === 'error' ? 'error' : flash.value.type === 'success' ? 'success' : 'info';
		return 'info';
	});

	const label = $derived((): string => {
		if (!onlineStore.online) return 'Working offline';
		if (connectivity.syncState === 'syncing') return 'Connected · Syncing…';
		if (connectivity.syncState === 'error') return 'Sync failed';
		if (flash.value) return flash.value.text;
		return '';
	});

	const variantStyle: Record<Variant, string> = {
		offline: 'bg-ink/80 text-paper',
		syncing: 'bg-accent/90 text-white',
		error: 'bg-red-600/90 text-white',
		success: 'bg-green-600/90 text-white',
		info: 'bg-ink/80 text-paper'
	};
</script>

{#if visible}
	<div
		class="fixed top-3 right-4 z-50 flex items-center gap-2 rounded-md px-3.5 py-1.5 font-sans text-xs font-medium shadow-md backdrop-blur-sm transition-all {variantStyle[variant()]}"
		role="status"
		aria-live="polite"
	>
		{#if connectivity.syncState === 'syncing'}
			<svg class="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
				<path d="M21 12a9 9 0 1 1-6.219-8.56" stroke-linecap="round"/>
			</svg>
		{:else if !onlineStore.online}
			<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
				<line x1="1" y1="1" x2="23" y2="23" stroke-linecap="round"/>
				<path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0" stroke-linecap="round" stroke-linejoin="round"/>
				<circle cx="12" cy="20" r="1" fill="currentColor"/>
			</svg>
		{/if}

		<span>{label()}</span>

		{#if connectivity.syncState === 'error'}
			<a
				href="/sync-log"
				class="underline underline-offset-2 opacity-90 hover:opacity-100"
			>
				View log
			</a>
		{/if}
	</div>
{/if}
