<script lang="ts" module>
	import type { LucideIcon } from '@lucide/svelte';

	export type RailItem = {
		id: string;
		label: string;
		icon: LucideIcon;
		/** Small count on the icon (open comments, backlinks…). */
		badge?: number;
		/** Starts a new group, with a divider above it. */
		group?: boolean;
	};
</script>

<script lang="ts">
	type Props = {
		items: RailItem[];
		active: string | null;
		ontoggle: (id: string) => void;
	};

	let { items, active, ontoggle }: Props = $props();
</script>

<!-- One side panel at a time: this rail opens, switches and closes them. -->
<nav
	aria-label="Side panels"
	class="flex w-11 shrink-0 flex-col items-center gap-1 border-l border-paper-border bg-paper py-2"
>
	{#each items as item (item.id)}
		{#if item.group}
			<div class="my-1 h-px w-6 bg-paper-border" aria-hidden="true"></div>
		{/if}
		<button
			type="button"
			onclick={() => ontoggle(item.id)}
			aria-pressed={active === item.id}
			aria-label={item.badge ? `${item.label} (${item.badge})` : item.label}
			title={item.label}
			class="relative flex h-8 w-8 items-center justify-center rounded-md transition-colors {active ===
			item.id
				? 'bg-accent/10 text-accent-ink'
				: 'text-ink-muted hover:bg-paper-ui hover:text-ink'}"
		>
			<item.icon size={17} strokeWidth={1.75} aria-hidden="true" />
			{#if item.badge}
				<span
					class="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 font-sans text-[11px] leading-none font-semibold text-white"
					aria-hidden="true"
				>
					{item.badge > 99 ? '99+' : item.badge}
				</span>
			{/if}
		</button>
	{/each}
</nav>
