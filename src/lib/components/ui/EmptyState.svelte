<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { LucideIcon } from '@lucide/svelte';

	type Props = {
		title: string;
		/** One sentence on why this place is useful once it has content. */
		description?: string;
		icon?: LucideIcon;
		/** The main thing to do next, e.g. a <Button>. */
		action?: Snippet;
		/** Smaller, for side panels. */
		compact?: boolean;
	};

	let { title, description, icon: Icon, action, compact = false }: Props = $props();
</script>

<div
	class="flex flex-col items-center text-center {compact
		? 'gap-2 px-4 py-8'
		: 'gap-3 rounded-xl border border-dashed border-paper-border px-6 py-12'}"
>
	{#if Icon}
		<div
			class="flex items-center justify-center rounded-full bg-paper-ui text-ink-faint {compact
				? 'h-9 w-9'
				: 'h-12 w-12'}"
		>
			<Icon size={compact ? 18 : 22} strokeWidth={1.5} aria-hidden="true" />
		</div>
	{/if}
	<p class="font-serif font-semibold text-ink {compact ? 'text-sm' : 'text-base'}">{title}</p>
	{#if description}
		<p class="max-w-sm font-sans text-ink-muted {compact ? 'text-xs' : 'text-sm'}">{description}</p>
	{/if}
	{#if action}
		<div class="mt-1">{@render action()}</div>
	{/if}
</div>
