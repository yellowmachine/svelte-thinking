<script lang="ts">
	let { children }: { children?: import('svelte').Snippet } = $props();
</script>

<div class="mt-3 flex gap-3 rounded-lg border border-accent/20 bg-accent/5 px-4 py-3 dark:border-accent/15 dark:bg-accent/5">
	<svg class="mt-0.5 shrink-0 text-accent" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
	</svg>
	<p class="font-sans text-xs leading-relaxed text-ink-muted dark:text-dark-ink-muted">
		{@render children?.()}
	</p>
</div>
