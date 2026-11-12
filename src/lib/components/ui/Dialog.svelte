<script lang="ts">
	import type { Snippet } from 'svelte';
	import X from '@lucide/svelte/icons/x';

	/**
	 * Modal dialog on the native <dialog> + showModal(): focus moves in and stays
	 * there, Escape and a click on the backdrop call onclose, and focus goes back
	 * to whatever opened it. Render it always and drive it with `open`.
	 */
	type Props = {
		open: boolean;
		onclose: () => void;
		title: string;
		description?: string;
		size?: 'sm' | 'md' | 'lg';
		/** Hide the × in the corner (e.g. while something is being saved). */
		hideClose?: boolean;
		children?: Snippet;
		/** Buttons row, right-aligned at the bottom. */
		footer?: Snippet;
	};

	let {
		open,
		onclose,
		title,
		description,
		size = 'md',
		hideClose = false,
		children,
		footer
	}: Props = $props();

	const uid = $props.id();
	const WIDTHS = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl' };

	// Re-runs when `open` changes.
	function syncOpen(el: HTMLDialogElement) {
		if (open && !el.open) el.showModal();
		if (!open && el.open) el.close();
	}
</script>

<dialog
	{@attach syncOpen}
	aria-labelledby="{uid}-title"
	aria-describedby={description ? `${uid}-desc` : undefined}
	oncancel={(e) => {
		e.preventDefault();
		onclose();
	}}
	onclick={(e) => {
		if (e.target === e.currentTarget) onclose();
	}}
	class="m-auto w-[calc(100%-2rem)] {WIDTHS[
		size
	]} rounded-xl border border-paper-border bg-paper p-0 text-ink shadow-xl backdrop:bg-black/40"
>
	{#if open}
		<div class="flex flex-col gap-4 p-6">
			<div class="flex items-start gap-4">
				<div class="min-w-0 flex-1">
					<h2 id="{uid}-title" class="font-serif text-lg font-semibold">{title}</h2>
					{#if description}
						<p id="{uid}-desc" class="mt-1 font-sans text-sm text-ink-muted">{description}</p>
					{/if}
				</div>
				{#if !hideClose}
					<button
						type="button"
						onclick={onclose}
						aria-label="Close"
						class="-m-1 rounded-md p-1 text-ink-muted transition-colors hover:bg-paper-ui hover:text-ink"
					>
						<X size={16} strokeWidth={1.75} aria-hidden="true" />
					</button>
				{/if}
			</div>
			{@render children?.()}
			{#if footer}
				<div class="flex flex-wrap justify-end gap-2">{@render footer()}</div>
			{/if}
		</div>
	{/if}
</dialog>
