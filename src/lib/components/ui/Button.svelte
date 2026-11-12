<script lang="ts" module>
	export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
	export type ButtonSize = 'sm' | 'md' | 'lg';

	const BASE =
		'inline-flex items-center justify-center gap-1.5 rounded-md font-sans font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50';

	export const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
		primary: 'bg-accent font-semibold text-white hover:bg-accent-hover',
		secondary: 'border border-paper-border text-ink-muted hover:bg-paper-ui hover:text-ink',
		ghost: 'text-ink-muted hover:bg-paper-ui hover:text-ink',
		danger: 'bg-red-700 font-semibold text-white hover:bg-red-800'
	};

	export const BUTTON_SIZES: Record<ButtonSize, string> = {
		sm: 'px-2.5 py-1 text-xs',
		md: 'px-3 py-1.5 text-sm',
		lg: 'px-4 py-2 text-sm'
	};

	/** The same look on things that can't be <Button> (e.g. a <label> around a file input). */
	export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md'): string {
		return `${BASE} ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]}`;
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { LucideIcon } from '@lucide/svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
	import Spinner from './Spinner.svelte';

	type CommonProps = {
		variant?: ButtonVariant;
		size?: ButtonSize;
		/** A Lucide icon, shown before the label. */
		icon?: LucideIcon;
		/** Shows a spinner and disables the button. */
		loading?: boolean;
		class?: string;
		children?: Snippet;
	};
	type Props = CommonProps &
		(
			| ({ href: string } & Omit<HTMLAnchorAttributes, 'class' | 'children'>)
			| ({ href?: undefined } & Omit<HTMLButtonAttributes, 'class' | 'children'>)
		);

	let {
		variant = 'primary',
		size = 'md',
		icon: Icon,
		loading = false,
		class: extra = '',
		children,
		...rest
	}: Props = $props();

	const classes = $derived(`${buttonClass(variant, size)} ${extra}`);
	const iconSize = $derived(size === 'sm' ? 13 : 15);
</script>

{#snippet content()}
	{#if loading}
		<Spinner size="sm" />
	{:else if Icon}
		<Icon size={iconSize} strokeWidth={1.75} aria-hidden="true" />
	{/if}
	{@render children?.()}
{/snippet}

{#if rest.href !== undefined}
	{@const { href, ...anchorRest } = rest as HTMLAnchorAttributes & { href: string }}
	<!-- Callers pass an href already built with resolve(). -->
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
	<a {href} {...anchorRest} class={classes} aria-disabled={loading || undefined}>
		{@render content()}
	</a>
{:else}
	{@const buttonRest = rest as HTMLButtonAttributes}
	<button
		type="button"
		{...buttonRest}
		class={classes}
		disabled={buttonRest.disabled || loading}
		aria-busy={loading || undefined}
	>
		{@render content()}
	</button>
{/if}
