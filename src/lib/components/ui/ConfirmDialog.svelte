<script lang="ts">
	import { confirmStore } from '$lib/stores/confirm.svelte';
	import Dialog from './Dialog.svelte';
	import Button from './Button.svelte';

	const pending = $derived(confirmStore.current);
</script>

<Dialog
	open={pending !== null}
	onclose={() => confirmStore.answer(false)}
	title={pending?.title ?? ''}
	description={pending?.message}
	size="md"
>
	{#snippet footer()}
		<Button variant="secondary" onclick={() => confirmStore.answer(false)}>
			{pending?.cancelLabel ?? 'Cancel'}
		</Button>
		<Button
			variant={pending?.danger ? 'danger' : 'primary'}
			autofocus
			onclick={() => confirmStore.answer(true)}
		>
			{pending?.confirmLabel ?? 'Confirm'}
		</Button>
	{/snippet}
</Dialog>
