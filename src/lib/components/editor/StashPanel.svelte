<script lang="ts">
	let {
		content,
		onclose
	}: {
		content: string;
		onclose: () => void;
	} = $props();

	let copied = $state(false);

	async function copyAll() {
		await navigator.clipboard.writeText(content);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<div
	class="flex w-80 shrink-0 flex-col overflow-hidden border-l border-paper-border dark:border-dark-paper-border"
>
	<!-- Header -->
	<div
		class="flex shrink-0 items-center justify-between border-b border-paper-border px-4 py-3 dark:border-dark-paper-border"
	>
		<div class="flex items-center gap-2">
			<!-- Layers icon -->
			<svg
				width="13"
				height="13"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="text-ink-muted dark:text-dark-ink-muted"
				aria-hidden="true"
			>
				<polygon points="12 2 2 7 12 12 22 7 12 2" />
				<polyline points="2 17 12 22 22 17" />
				<polyline points="2 12 12 17 22 12" />
			</svg>
			<h3 class="font-serif text-sm font-semibold text-ink dark:text-dark-ink">Stash</h3>
		</div>

		<div class="flex items-center gap-1">
			<!-- Copiar todo -->
			<button
				type="button"
				onclick={copyAll}
				title={copied ? 'Copiado' : 'Copiar todo'}
				class="rounded p-1.5 text-ink-muted transition-colors hover:bg-paper-ui hover:text-ink dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui dark:hover:text-dark-ink"
			>
				{#if copied}
					<svg
						width="13"
						height="13"
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
				{:else}
					<svg
						width="13"
						height="13"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
						<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
					</svg>
				{/if}
			</button>

			<!-- Cerrar -->
			<button
				type="button"
				onclick={onclose}
				aria-label="Cerrar stash"
				class="rounded p-1.5 text-ink-muted transition-colors hover:bg-paper-ui hover:text-ink dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui dark:hover:text-dark-ink"
			>
				<svg
					width="13"
					height="13"
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
	</div>

	<!-- Nota de contexto -->
	<div
		class="shrink-0 border-b border-paper-border/50 bg-amber-50 px-4 py-2 dark:border-dark-paper-border/50 dark:bg-amber-900/10"
	>
		<p class="font-sans text-xs leading-relaxed text-amber-700 dark:text-amber-400">
			Contenido descartado al resolver el conflicto. Selecciona y copia lo que necesites.
		</p>
	</div>

	<!-- Contenido como texto plano: tamaño y peso normales, adecuado para cherry-pick -->
	<div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
		<pre
			class="font-sans text-sm leading-relaxed whitespace-pre-wrap text-ink dark:text-dark-ink">{content}</pre>
	</div>
</div>
