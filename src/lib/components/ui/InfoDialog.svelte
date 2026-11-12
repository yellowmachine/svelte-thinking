<script lang="ts">
	import Dialog from './Dialog.svelte';
	import Button from './Button.svelte';

	type Props = {
		open: boolean;
		title: string;
		message: string;
		actionLabel?: string;
		/** Already built with resolve() by the caller. */
		actionHref?: string;
		oncancel: () => void;
	};

	let { open, title, message, actionLabel, actionHref, oncancel }: Props = $props();
</script>

<Dialog {open} onclose={oncancel} {title} description={message} size="sm">
	{#snippet footer()}
		<Button variant="secondary" onclick={oncancel}>Close</Button>
		{#if actionLabel && actionHref}
			<Button href={actionHref}>{actionLabel}</Button>
		{/if}
	{/snippet}
</Dialog>
