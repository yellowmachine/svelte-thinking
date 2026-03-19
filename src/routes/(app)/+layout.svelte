<script lang="ts">
	import Navbar from '$lib/components/layout/Navbar.svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
</script>

<div class="flex min-h-screen flex-col bg-paper-ui dark:bg-dark-paper-ui">
	<Navbar user={data.user} />
	<main class="flex-1">
		{@render children()}
	</main>
</div>
