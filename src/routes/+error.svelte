<script lang="ts">
	import { page } from '$app/state';
	import ErrorPage from '$lib/components/ui/ErrorPage.svelte';

	$effect(() => {
		if (typeof navigator !== 'undefined' && !navigator.onLine) {
			window.location.replace('/offline');
		}
	});
</script>

<ErrorPage status={page.status} />
