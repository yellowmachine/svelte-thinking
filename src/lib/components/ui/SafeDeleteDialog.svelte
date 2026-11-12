<script lang="ts">
	import Dialog from './Dialog.svelte';
	import Button from './Button.svelte';
	type Props = {
		open: boolean;
		/** Short description of what is being acted on, e.g. "the document" or "the project" */
		label: string;
		/** Longer warning shown below the label */
		warning?: string;
		deleting?: boolean;
		/** Override the dialog title. Defaults to "Delete {label}" */
		title?: string;
		/** Override the confirm button label. Defaults to "Delete" */
		confirmLabel?: string;
		/** Whether to require typing a 3-char code. Defaults to true. */
		requireCode?: boolean;
		onconfirm: () => void;
		oncancel: () => void;
	};

	let {
		open,
		label,
		warning,
		deleting = false,
		title,
		confirmLabel,
		requireCode = true,
		onconfirm,
		oncancel
	}: Props = $props();

	const CHARS = 'abcdefghjkmnpqrstuvwxyz23456789'; // no ambiguous chars (0/O, 1/l/I)
	function genCode() {
		return Array.from({ length: 3 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join(
			''
		);
	}

	let code = $state(genCode());
	let input = $state('');
	let inputEl = $state<HTMLInputElement | undefined>(undefined);

	const matches = $derived(!requireCode || input === code);

	// Regenerate code and reset input each time the dialog opens
	$effect(() => {
		if (open) {
			code = genCode();
			input = '';
			// Focus after DOM update
			setTimeout(() => inputEl?.focus(), 50);
		}
	});

	function handleConfirm() {
		if (!matches || deleting) return;
		onconfirm();
	}
</script>

<Dialog
	{open}
	onclose={() => {
		if (!deleting) oncancel();
	}}
	title={title ?? `Delete ${label}`}
	description={warning}
	size="sm"
	hideClose={deleting}
>
	{#if requireCode}
		<div>
			<p class="mb-3 font-sans text-sm text-ink-muted">To confirm, type these three characters:</p>
			<div class="mb-3 flex justify-center gap-3" aria-hidden="true">
				{#each code.split('') as char, i (i)}
					<span
						class="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-danger-border bg-danger-bg font-mono text-xl font-bold tracking-widest text-danger"
					>
						{char}
					</span>
				{/each}
			</div>
			<input
				bind:this={inputEl}
				bind:value={input}
				type="text"
				maxlength="3"
				autocomplete="off"
				autocorrect="off"
				spellcheck="false"
				aria-label="Type {code.split('').join(' ')} to confirm"
				onkeydown={(e) => e.key === 'Enter' && handleConfirm()}
				placeholder="···"
				class="w-full rounded-lg border px-3 py-2 text-center font-mono text-lg tracking-widest transition-colors focus:outline-none {matches
					? 'border-danger bg-danger-bg text-danger'
					: 'border-paper-border bg-paper-ui text-ink focus:border-accent'}"
			/>
		</div>
	{/if}

	{#snippet footer()}
		<Button variant="secondary" onclick={oncancel} disabled={deleting}>Cancel</Button>
		<Button variant="danger" onclick={handleConfirm} disabled={!matches} loading={deleting}>
			{confirmLabel ?? 'Delete'}
		</Button>
	{/snippet}
</Dialog>
