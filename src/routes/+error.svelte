<script lang="ts">
	import { page } from '$app/state';
	import ErrorPage from '$lib/components/ui/ErrorPage.svelte';
	import OfflineView from '$lib/components/ui/OfflineView.svelte';
	import { onMount } from 'svelte';

	let offline = $state(false);

	onMount(() => {
		offline = !navigator.onLine;
		window.addEventListener('online', () => (offline = false));
		window.addEventListener('offline', () => (offline = true));
	});
</script>

{#if offline}
	<OfflineView />
{:else}
	<ErrorPage status={page.status} />
{/if}
