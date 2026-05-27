<script lang="ts">
	let {
		type,
		versionNumber,
		committerName,
		hasDirtyContent,
		onupdate,
		onresolve,
		ondismiss
	}: {
		type: 'commit' | 'draft';
		versionNumber: number | null;
		committerName: string | null;
		hasDirtyContent: boolean;
		onupdate: () => void;
		/** Solo para type='draft' con cambios locales: abre el modal de diff en lugar de recargar */
		onresolve?: () => void;
		ondismiss: () => void;
	} = $props();

	// Cuando hay conflicto real (draft externo + cambios locales), mostramos "Resolver"
	const showResolve = $derived(type === 'draft' && hasDirtyContent && onresolve != null);
</script>

<div
	class="flex items-center gap-3 bg-amber-50 px-6 py-2.5 dark:bg-amber-900/20"
	role="status"
	aria-live="polite"
>
	<!-- Icono info -->
	<svg
		width="15"
		height="15"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.5"
		stroke-linecap="round"
		stroke-linejoin="round"
		class="shrink-0 text-amber-600 dark:text-amber-400"
		aria-hidden="true"
	>
		<circle cx="12" cy="12" r="10" />
		<line x1="12" y1="8" x2="12" y2="12" />
		<line x1="12" y1="16" x2="12.01" y2="16" />
	</svg>

	<p class="min-w-0 flex-1 font-sans text-sm text-amber-800 dark:text-amber-200">
		{#if type === 'commit'}
			<span class="font-medium">
				Nueva versión disponible{versionNumber != null ? ` (v${versionNumber})` : ''}{committerName
					? ` · por ${committerName}`
					: ''}.
			</span>
		{:else}
			<span class="font-medium">
				Hay un borrador más reciente{committerName
					? ` guardado por ${committerName}`
					: ' guardado desde otro dispositivo'}.
			</span>
		{/if}
		{#if hasDirtyContent}
			<span class="ml-1 text-amber-700 dark:text-amber-300">
				Tienes cambios sin guardar que se perderán al actualizar.
			</span>
		{/if}
	</p>

	<div class="flex shrink-0 items-center gap-2">
		{#if showResolve}
			<button
				type="button"
				onclick={onresolve}
				class="rounded-md bg-amber-600 px-3 py-1 font-sans text-xs font-medium text-white transition-opacity hover:opacity-90 dark:bg-amber-500"
			>
				Resolver conflicto
			</button>
		{:else}
			<button
				type="button"
				onclick={onupdate}
				class="rounded-md bg-amber-600 px-3 py-1 font-sans text-xs font-medium text-white transition-opacity hover:opacity-90 dark:bg-amber-500"
			>
				Actualizar
			</button>
		{/if}
		<button
			type="button"
			onclick={ondismiss}
			class="rounded-md px-3 py-1 font-sans text-xs text-amber-700 transition-colors hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/40"
		>
			Descartar
		</button>
	</div>
</div>
