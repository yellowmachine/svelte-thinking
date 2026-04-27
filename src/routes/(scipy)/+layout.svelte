<script lang="ts">
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
</script>

<div class="flex h-screen flex-col overflow-hidden bg-paper-ui dark:bg-dark-paper-ui">
	<header class="border-b border-paper-border px-6 py-3 dark:border-dark-paper-border">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-3">
				<a
					href="https://scholio.review"
					class="text-sm text-ink-faint hover:text-ink dark:text-dark-ink-faint dark:hover:text-dark-ink"
				>
					← Scholio
				</a>
				<span class="text-ink-faint dark:text-dark-ink-faint">/</span>
				<span class="font-semibold text-ink dark:text-dark-ink">scipy</span>
			</div>
			<span class="text-sm text-ink-faint dark:text-dark-ink-faint">{data.user.name}</span>
		</div>
	</header>

	<main class="flex-1 overflow-y-auto">
		{@render children()}
	</main>
</div>
