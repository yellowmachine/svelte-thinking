<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import ErrorPage from '$lib/components/ui/ErrorPage.svelte';
	import { onlineStore } from '$lib/stores/online.svelte';

	$effect(() => {
		if (!onlineStore.online) {
			goto('/offline', { replaceState: true });
		}
	});
</script>

<ErrorPage status={page.status} />
