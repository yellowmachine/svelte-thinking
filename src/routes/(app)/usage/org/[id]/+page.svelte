<script lang="ts">
	import UsageDashboard from '$lib/components/usage/UsageDashboard.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<UsageDashboard mode="org" orgId={data.org.id} orgName={data.org.name} />
