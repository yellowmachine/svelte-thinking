<script lang="ts">
	import { page } from '$app/state';
	import ErrorPage from '$lib/components/ui/ErrorPage.svelte';
	import OfflineView from '$lib/components/ui/OfflineView.svelte';
	import { onlineStore } from '$lib/stores/online.svelte';
	import { onMount } from 'svelte';

	onMount(() => {
		// Safety net: if onlineStore hasn't probed yet (just after a page reload),
		// force an immediate check so the UI updates within the probe timeout.
		onlineStore.refresh();
	});
</script>

{#if !onlineStore.online}
	<OfflineView />
{:else}
	<ErrorPage status={page.status} />
{/if}
