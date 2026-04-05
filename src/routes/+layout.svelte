<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { einkStore } from '$lib/stores/eink.svelte';
	import { onlineStore } from '$lib/stores/online.svelte';

	let { children } = $props();

	$effect(() => {
		einkStore.init();
		onlineStore.init();
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<a
	href="#main-content"
	class="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:font-sans focus:text-sm focus:font-semibold focus:text-white"
>
	Skip to main content
</a>

{#if !onlineStore.online}
	<div
		class="fixed right-0 bottom-0 left-0 z-50 flex items-center justify-center gap-2 bg-ink px-4 py-2 dark:bg-dark-paper-border"
	>
		<span class="h-2 w-2 rounded-full bg-amber-400"></span>
		<p class="font-sans text-xs font-medium text-paper dark:text-dark-ink">
			Without connection — showing saved content
		</p>
	</div>
{/if}

{@render children()}
