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
	<footer class="border-t border-paper-border px-6 py-3 dark:border-dark-paper-border">
		<p class="text-center font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
			Scholio Beta · Desarrollado con
			<a
				href="https://claude.ai/code"
				target="_blank"
				rel="noopener noreferrer"
				class="underline decoration-dotted hover:text-ink-muted dark:hover:text-dark-ink-muted"
			>Claude Code</a
			>
			· Asistente IA impulsado por
			<span class="font-medium">Claude Haiku 4.5</span> (Anthropic)
		</p>
	</footer>
</div>
