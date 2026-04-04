<script lang="ts">
	import UsageDashboard from '$lib/components/usage/UsageDashboard.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<UsageDashboard mode="personal" ownedOrgs={data.ownedOrgs} />
