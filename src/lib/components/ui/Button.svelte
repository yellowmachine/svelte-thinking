<script lang="ts">
	type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
	type Size = 'sm' | 'md' | 'lg';

	let {
		variant = 'primary',
		size = 'md',
		label,
		disabled = false,
		onclick
	}: {
		variant?: Variant;
		size?: Size;
		label: string;
		disabled?: boolean;
		onclick?: () => void;
	} = $props();

	const base =
		'inline-flex items-center justify-center rounded-md font-sans font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 cursor-pointer';

	const variants: Record<Variant, string> = {
		primary: 'bg-accent text-white hover:bg-accent-hover',
		secondary:
			'bg-paper-border text-ink hover:bg-paper-border/80 dark:bg-dark-paper-border dark:text-dark-ink',
		ghost: 'text-ink-muted hover:bg-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-border',
		danger: 'bg-red-600 text-white hover:bg-red-700'
	};

	const sizes: Record<Size, string> = {
		sm: 'px-2.5 py-1.5 text-xs',
		md: 'px-3 py-2 text-sm',
		lg: 'px-4 py-2.5 text-base'
	};
</script>

<button class="{base} {variants[variant]} {sizes[size]}" {disabled} {onclick}>
	{label}
</button>
