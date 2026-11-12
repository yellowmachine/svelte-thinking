<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import Copy from '@lucide/svelte/icons/copy';
	import X from '@lucide/svelte/icons/x';
	import DiffViewer from './DiffViewer.svelte';

	let {
		localContent,
		remoteContent,
		onkeepmyself,
		onkeepremote,
		onclose
	}: {
		localContent: string;
		remoteContent: string;
		onkeepmyself: () => void;
		onkeepremote: () => void;
		onclose: () => void;
	} = $props();

	let copiedLocal = $state(false);
	let copiedRemote = $state(false);

	async function copyLocal() {
		await navigator.clipboard.writeText(localContent);
		copiedLocal = true;
		setTimeout(() => (copiedLocal = false), 2000);
	}

	async function copyRemote() {
		await navigator.clipboard.writeText(remoteContent);
		copiedRemote = true;
		setTimeout(() => (copiedRemote = false), 2000);
	}
</script>

<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
	role="dialog"
	aria-modal="true"
	aria-labelledby="draft-conflict-title"
>
	<div class="flex max-h-[90vh] w-full max-w-5xl flex-col gap-4 rounded-2xl bg-paper p-6 shadow-xl">
		<!-- Header -->
		<div class="flex shrink-0 items-start justify-between">
			<div>
				<h2 id="draft-conflict-title" class="font-serif text-lg font-semibold text-ink">
					Draft conflict
				</h2>
				<p class="mt-1 font-sans text-sm leading-relaxed text-ink-muted">
					Your local draft differs from the one saved on another device. Choose which content to
					keep.
				</p>
			</div>
			<button
				type="button"
				onclick={onclose}
				class="shrink-0 rounded-md p-1.5 text-ink-muted transition-colors hover:bg-paper-ui hover:text-ink"
				aria-label="Close"
			>
				<X size={16} strokeWidth={1.75} aria-hidden="true" />
			</button>
		</div>

		<!-- Diff (scrollable, ocupa el espacio disponible) -->
		<div class="min-h-0 flex-1 overflow-y-auto">
			<DiffViewer
				oldText={localContent}
				newText={remoteContent}
				oldLabel="Your draft (local)"
				newLabel="Server draft"
			/>
		</div>

		<!-- Acciones alineadas a las dos columnas del diff -->
		<div class="grid shrink-0 grid-cols-2 gap-3 border-t border-paper-border pt-4">
			<!-- Columna izquierda: acciones sobre el borrador local -->
			<div class="flex items-center gap-2">
				<button
					type="button"
					onclick={copyLocal}
					class="flex items-center gap-1.5 rounded-md border border-paper-border px-3 py-1.5 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-ui"
				>
					{#if copiedLocal}
						<Check size={12} strokeWidth={1.75} aria-hidden="true" />
						Copied
					{:else}
						<Copy size={12} strokeWidth={1.75} aria-hidden="true" />
						Copy mine
					{/if}
				</button>
				<button
					type="button"
					onclick={onkeepmyself}
					class="rounded-md bg-accent px-3 py-1.5 font-sans text-xs font-medium text-white transition-opacity hover:opacity-90"
				>
					Keep mine
				</button>
			</div>

			<!-- Columna derecha: acciones sobre el borrador del servidor -->
			<div class="flex items-center justify-end gap-2">
				<button
					type="button"
					onclick={copyRemote}
					class="flex items-center gap-1.5 rounded-md border border-paper-border px-3 py-1.5 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-ui"
				>
					{#if copiedRemote}
						<Check size={12} strokeWidth={1.75} aria-hidden="true" />
						Copied
					{:else}
						<Copy size={12} strokeWidth={1.75} aria-hidden="true" />
						Copy the server's
					{/if}
				</button>
				<button
					type="button"
					onclick={onkeepremote}
					class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-xs font-medium text-ink transition-colors hover:bg-paper-ui"
				>
					Use the server's
				</button>
			</div>
		</div>
	</div>
</div>
