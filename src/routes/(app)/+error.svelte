<script lang="ts">
	import { page } from '$app/state';
	import ErrorPage from '$lib/components/ui/ErrorPage.svelte';
</script>

<!-- Errors inside the app keep the navbar: only the content area is replaced. -->
<ErrorPage status={page.status} detail={page.error?.message} embedded />
