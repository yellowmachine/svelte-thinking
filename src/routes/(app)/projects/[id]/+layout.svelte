<script lang="ts">
	import type { LayoutData } from './$types';
	import { workspaceStore } from '$lib/stores/workspace.svelte';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	$effect(() => { workspaceStore.syncToOrg(data.projectOrgId); });
</script>

{@render children()}
