<script lang="ts">
	let {
		requirement,
		documents,
		projectId,
		isOwner,
		pickerOpen = false,
		fulfilling = false,
		onfulfill,
		onunfulfill,
		ondelete,
		ontogglePicker
	}: {
		requirement: {
			id: string;
			name: string;
			description: string | null;
			required: boolean;
			fulfilledDocumentId: string | null;
		};
		documents: { id: string; title: string; type: string }[];
		projectId: string;
		isOwner: boolean;
		pickerOpen?: boolean;
		fulfilling?: boolean;
		onfulfill?: (documentId: string) => void;
		onunfulfill?: () => void;
		ondelete?: () => void;
		ontogglePicker?: () => void;
	} = $props();

	const isFulfilled = $derived(requirement.fulfilledDocumentId !== null);

	const fulfilledDocTitle = $derived(
		requirement.fulfilledDocumentId
			? (documents.find((d) => d.id === requirement.fulfilledDocumentId)?.title ?? '(documento eliminado)')
			: ''
	);

	const docTypeLabel: Record<string, string> = {
		paper: 'Artículo',
		notes: 'Notas',
		outline: 'Esquema',
		bibliography: 'Bibliografía',
		supplementary: 'Suplementario'
	};
</script>

<li
	class="group rounded-xl border transition-colors {isFulfilled
		? 'border-green-200 bg-green-50 dark:border-green-900/40 dark:bg-green-950/20'
		: 'border-paper-border bg-paper dark:border-dark-paper-border dark:bg-dark-paper'}"
>
	<div class="flex items-start gap-3 p-4">
		<!-- Check indicator -->
		<div class="mt-0.5 shrink-0">
			{#if isFulfilled}
				<div class="flex h-5 w-5 items-center justify-center rounded-full bg-green-500">
					<svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
						<path d="M2 6l3 3 5-5" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				</div>
			{:else}
				<div class="h-5 w-5 rounded-full border-2 border-paper-border dark:border-dark-paper-border"></div>
			{/if}
		</div>

		<div class="min-w-0 flex-1">
			<!-- Name + optional badge -->
			<div class="flex flex-wrap items-center gap-2">
				<span class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">{requirement.name}</span>
				{#if !requirement.required}
					<span class="rounded-full bg-paper-border px-2 py-0.5 font-sans text-[10px] font-medium uppercase tracking-wide text-ink-faint dark:bg-dark-paper-border dark:text-dark-ink-faint">
						Opcional
					</span>
				{/if}
			</div>

			{#if requirement.description}
				<p class="mt-0.5 font-sans text-xs leading-relaxed text-ink-muted dark:text-dark-ink-muted">
					{requirement.description}
				</p>
			{/if}

			<!-- Fulfilled state -->
			{#if isFulfilled}
				<div class="mt-2 flex flex-wrap items-center gap-2">
					<a
						href="/projects/{projectId}/documents/{requirement.fulfilledDocumentId}"
						class="flex items-center gap-1.5 rounded-md border border-green-200 bg-white px-2.5 py-1 font-sans text-xs font-medium text-green-700 transition-colors hover:bg-green-50 dark:border-green-900/40 dark:bg-dark-paper dark:text-green-400 dark:hover:bg-green-950/30"
					>
						<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
							<polyline points="14 2 14 8 20 8" />
						</svg>
						{fulfilledDocTitle}
					</a>
					{#if isOwner}
						<button
							onclick={onunfulfill}
							disabled={fulfilling}
							class="font-sans text-xs text-ink-faint underline-offset-2 hover:text-ink hover:underline disabled:opacity-40 dark:text-dark-ink-faint dark:hover:text-dark-ink"
						>
							Cambiar
						</button>
					{/if}
				</div>

			<!-- Pending state (owner) -->
			{:else if isOwner}
				{#if pickerOpen}
					<div class="mt-2 rounded-lg border border-paper-border bg-paper-ui p-2 dark:border-dark-paper-border dark:bg-dark-paper-ui">
						{#if documents.length === 0}
							<p class="px-1 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
								No hay documentos en este proyecto.
							</p>
						{:else}
							<ul class="max-h-44 space-y-0.5 overflow-y-auto">
								{#each documents as doc (doc.id)}
									<li>
										<button
											onclick={() => onfulfill?.(doc.id)}
											disabled={fulfilling}
											class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-sans text-xs transition-colors hover:bg-paper-border disabled:opacity-40 dark:hover:bg-dark-paper-border"
										>
											<span class="rounded bg-paper-border px-1.5 py-0.5 font-sans text-[10px] text-ink-faint dark:bg-dark-paper-border dark:text-dark-ink-faint">
												{docTypeLabel[doc.type] ?? doc.type}
											</span>
											<span class="min-w-0 truncate text-ink dark:text-dark-ink">{doc.title}</span>
										</button>
									</li>
								{/each}
							</ul>
						{/if}
						<button
							onclick={ontogglePicker}
							class="mt-1.5 w-full rounded-md py-1 font-sans text-xs text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
						>
							Cancelar
						</button>
					</div>
				{:else}
					<button
						onclick={ontogglePicker}
						class="mt-2 flex items-center gap-1.5 font-sans text-xs text-accent underline-offset-2 hover:underline"
					>
						<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<line x1="12" y1="5" x2="12" y2="19" />
							<line x1="5" y1="12" x2="19" y2="12" />
						</svg>
						Asignar documento
					</button>
				{/if}
			{/if}
		</div>

		<!-- Delete (owner only, visible on row hover) -->
		{#if isOwner}
			<button
				onclick={ondelete}
				title="Eliminar requisito"
				class="shrink-0 rounded p-1 text-ink-faint opacity-0 transition-opacity hover:text-ink group-hover:opacity-100 dark:text-dark-ink-faint dark:hover:text-dark-ink"
			>
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<polyline points="3 6 5 6 21 6" />
					<path d="M19 6l-1 14H6L5 6" />
					<path d="M10 11v6M14 11v6" />
					<path d="M9 6V4h6v2" />
				</svg>
			</button>
		{/if}
	</div>
</li>
