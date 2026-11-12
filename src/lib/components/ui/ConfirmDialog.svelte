<script lang="ts">
	import { confirmStore } from '$lib/stores/confirm.svelte';

	// Native <dialog> + showModal(): focus moves into it, stays trapped, Escape
	// closes it (the "cancel" event) and focus returns to the opener afterwards.
	const pending = $derived(confirmStore.current);

	// Re-runs whenever `pending` changes: opens or closes the native dialog.
	function syncOpen(el: HTMLDialogElement) {
		if (pending && !el.open) el.showModal();
		if (!pending && el.open) el.close();
	}
</script>

<dialog
	{@attach syncOpen}
	aria-labelledby="confirm-dialog-title"
	aria-describedby={pending?.message ? 'confirm-dialog-message' : undefined}
	oncancel={(e) => {
		e.preventDefault();
		confirmStore.answer(false);
	}}
	onclick={(e) => {
		// Click on the backdrop (the dialog element itself, outside its box)
		if (e.target === e.currentTarget) confirmStore.answer(false);
	}}
	class="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-paper-border bg-paper p-0 text-ink shadow-xl backdrop:bg-black/40"
>
	{#if pending}
		<div class="p-6">
			<h2 id="confirm-dialog-title" class="font-serif text-lg font-semibold">{pending.title}</h2>
			{#if pending.message}
				<p id="confirm-dialog-message" class="mt-2 font-sans text-sm text-ink-muted">
					{pending.message}
				</p>
			{/if}
			<div class="mt-6 flex justify-end gap-2">
				<button
					type="button"
					onclick={() => confirmStore.answer(false)}
					class="rounded-md border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui"
				>
					{pending.cancelLabel ?? 'Cancel'}
				</button>
				<!-- svelte-ignore a11y_autofocus -->
				<button
					type="button"
					autofocus
					onclick={() => confirmStore.answer(true)}
					class="rounded-md px-4 py-2 font-sans text-sm font-semibold text-white transition-colors {pending.danger
						? 'bg-red-600 hover:bg-red-700'
						: 'bg-accent hover:bg-accent-hover'}"
				>
					{pending.confirmLabel ?? 'Confirm'}
				</button>
			</div>
		</div>
	{/if}
</dialog>
