<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Props = Omit<HTMLButtonAttributes, 'class' | 'children' | 'aria-label'> & {
		/** Required: the accessible name, also shown as the tooltip. */
		label: string;
		icon: LucideIcon;
		variant?: 'ghost' | 'outline';
		size?: 'sm' | 'md';
		/** For toggles: sets aria-pressed and the active look. */
		pressed?: boolean;
		class?: string;
	};

	let {
		label,
		icon: Icon,
		variant = 'ghost',
		size = 'md',
		pressed,
		class: extra = '',
		...rest
	}: Props = $props();

	const box = $derived(size === 'sm' ? 'h-7 w-7' : 'h-8 w-8');
	const look = $derived(
		pressed
			? 'border border-accent bg-accent/10 text-accent-ink'
			: variant === 'outline'
				? 'border border-paper-border text-ink-muted hover:bg-paper-ui hover:text-ink'
				: 'text-ink-muted hover:bg-paper-ui hover:text-ink'
	);
</script>

<button
	type="button"
	{...rest}
	aria-label={label}
	title={rest.title ?? label}
	aria-pressed={pressed}
	class="inline-flex shrink-0 items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-50 {box} {look} {extra}"
>
	<Icon size={size === 'sm' ? 14 : 16} strokeWidth={1.75} aria-hidden="true" />
</button>
