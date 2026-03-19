<script lang="ts">
	type DocType = 'paper' | 'notes' | 'outline' | 'bibliography' | 'supplementary';

	let {
		title,
		type = 'paper',
		active = false,
		onclick
	}: {
		title: string;
		type?: DocType;
		active?: boolean;
		onclick?: () => void;
	} = $props();

	const typeIcon: Record<DocType, string> = {
		paper: 'M3 4h8M3 7h8M3 10h5',
		notes: 'M3 4h8M3 7h6M3 10h4',
		outline: 'M3 4h8M5 7h6M7 10h4',
		bibliography: 'M3 3h8v8H3zM5 6h4M5 8h2',
		supplementary: 'M6 3v8M3 6h8'
	};
</script>

<button
	{onclick}
	class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left font-sans text-sm transition-colors
		{active
		? 'bg-accent-light text-accent dark:bg-accent/20 dark:text-dark-ink'
		: 'text-ink-muted hover:bg-paper-border/50 dark:text-dark-ink-muted dark:hover:bg-dark-paper-border/50'}"
>
	<svg width="13" height="13" viewBox="0 0 13 13" fill="none" class="shrink-0 opacity-60">
		<path d={typeIcon[type]} stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
	</svg>
	<span class="truncate">{title}</span>
</button>
