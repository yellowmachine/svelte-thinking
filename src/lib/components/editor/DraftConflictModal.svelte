<script lang="ts">
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
	<div
		class="flex max-h-[90vh] w-full max-w-5xl flex-col gap-4 rounded-2xl bg-paper p-6 shadow-xl dark:bg-dark-paper"
	>
		<!-- Header -->
		<div class="flex shrink-0 items-start justify-between">
			<div>
				<h2
					id="draft-conflict-title"
					class="font-serif text-lg font-semibold text-ink dark:text-dark-ink"
				>
					Conflicto de borrador
				</h2>
				<p class="mt-1 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
					Tu borrador local difiere del guardado desde otro dispositivo. Elige qué contenido
					conservar.
				</p>
			</div>
			<button
				type="button"
				onclick={onclose}
				class="shrink-0 rounded-md p-1.5 text-ink-muted transition-colors hover:bg-paper-ui hover:text-ink dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui dark:hover:text-dark-ink"
				aria-label="Cerrar"
			>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<line x1="18" y1="6" x2="6" y2="18" />
					<line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>
		</div>

		<!-- Diff (scrollable, ocupa el espacio disponible) -->
		<div class="min-h-0 flex-1 overflow-y-auto">
			<DiffViewer
				oldText={localContent}
				newText={remoteContent}
				oldLabel="Tu borrador (local)"
				newLabel="Borrador del servidor"
			/>
		</div>

		<!-- Acciones alineadas a las dos columnas del diff -->
		<div
			class="grid shrink-0 grid-cols-2 gap-3 border-t border-paper-border pt-4 dark:border-dark-paper-border"
		>
			<!-- Columna izquierda: acciones sobre el borrador local -->
			<div class="flex items-center gap-2">
				<button
					type="button"
					onclick={copyLocal}
					class="flex items-center gap-1.5 rounded-md border border-paper-border px-3 py-1.5 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
				>
					{#if copiedLocal}
						<svg
							width="12"
							height="12"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<polyline points="20 6 9 17 4 12" />
						</svg>
						Copiado
					{:else}
						<svg
							width="12"
							height="12"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
							<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
						</svg>
						Copiar el mío
					{/if}
				</button>
				<button
					type="button"
					onclick={onkeepmyself}
					class="rounded-md bg-accent px-3 py-1.5 font-sans text-xs font-medium text-white transition-opacity hover:opacity-90"
				>
					Mantener el mío
				</button>
			</div>

			<!-- Columna derecha: acciones sobre el borrador del servidor -->
			<div class="flex items-center justify-end gap-2">
				<button
					type="button"
					onclick={copyRemote}
					class="flex items-center gap-1.5 rounded-md border border-paper-border px-3 py-1.5 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
				>
					{#if copiedRemote}
						<svg
							width="12"
							height="12"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<polyline points="20 6 9 17 4 12" />
						</svg>
						Copiado
					{:else}
						<svg
							width="12"
							height="12"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
							<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
						</svg>
						Copiar el del servidor
					{/if}
				</button>
				<button
					type="button"
					onclick={onkeepremote}
					class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-xs font-medium text-ink transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink dark:hover:bg-dark-paper-ui"
				>
					Usar el del servidor
				</button>
			</div>
		</div>
	</div>
</div>
