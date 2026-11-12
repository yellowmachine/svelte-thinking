<script lang="ts">
	import type { Snippet } from 'svelte';
	import CircleExclamationPoint from '@lucide/svelte/icons/circle-exclamation-point';
	import TriangleExclamationPoint from '@lucide/svelte/icons/triangle-exclamation-point';
	import Info from '@lucide/svelte/icons/info';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import X from '@lucide/svelte/icons/x';

	export type BannerVariant = 'danger' | 'warning' | 'info' | 'success';

	type Props = {
		variant?: BannerVariant;
		/** Full-width strip under the navbar (default) or a rounded box inside a page. */
		layout?: 'strip' | 'box';
		/** Shows a close button. */
		ondismiss?: () => void;
		children: Snippet;
		/** Optional trailing content, e.g. a link or a button. */
		action?: Snippet;
	};

	let { variant = 'info', layout = 'strip', ondismiss, children, action }: Props = $props();

	const ICONS = {
		danger: CircleExclamationPoint,
		warning: TriangleExclamationPoint,
		info: Info,
		success: CircleCheck
	};
	const COLORS: Record<BannerVariant, string> = {
		danger: 'border-danger-border bg-danger-bg text-danger',
		warning: 'border-warning-border bg-warning-bg text-warning',
		info: 'border-info-border bg-info-bg text-info',
		success: 'border-success-border bg-success-bg text-success'
	};
	const Icon = $derived(ICONS[variant]);
</script>

<div
	role={variant === 'danger' ? 'alert' : 'status'}
	class="flex items-start gap-3 font-sans text-sm {COLORS[variant]} {layout === 'strip'
		? 'shrink-0 border-b px-4 py-2.5'
		: 'rounded-lg border px-4 py-3'}"
>
	<Icon size={16} strokeWidth={2} class="mt-0.5 shrink-0" aria-hidden="true" />
	<div class="min-w-0 flex-1">{@render children()}</div>
	{#if action}
		<div class="shrink-0">{@render action()}</div>
	{/if}
	{#if ondismiss}
		<button
			type="button"
			onclick={ondismiss}
			aria-label="Dismiss"
			class="-m-1 shrink-0 rounded p-1 opacity-70 transition-opacity hover:opacity-100"
		>
			<X size={14} strokeWidth={2.25} aria-hidden="true" />
		</button>
	{/if}
</div>
