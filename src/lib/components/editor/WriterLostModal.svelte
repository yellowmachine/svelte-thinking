<script lang="ts">
	let {
		content,
		onclose
	}: {
		content: string;
		onclose: () => void;
	} = $props();
</script>

<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
	role="dialog"
	aria-modal="true"
>
	<div
		class="flex w-full max-w-lg flex-col gap-4 rounded-2xl bg-paper p-6 shadow-xl dark:bg-dark-paper"
	>
		<div>
			<h2 class="font-serif text-lg font-semibold text-ink dark:text-dark-ink">
				Cambios offline no sincronizados
			</h2>
			<p class="mt-1 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
				Mientras estabas sin conexión, otro colaborador tomó el control de edición. Tus cambios no
				se han sincronizado. Cópialos antes de cerrar.
			</p>
		</div>
		<textarea
			readonly
			value={content}
			class="h-48 w-full resize-none rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-mono text-xs text-ink focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
		></textarea>
		<div class="flex justify-end">
			<button
				type="button"
				onclick={onclose}
				class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90"
			>
				Descartar
			</button>
		</div>
	</div>
</div>
