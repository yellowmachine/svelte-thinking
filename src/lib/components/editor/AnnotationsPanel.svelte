<script lang="ts">
	type Subnote = {
		id: number;
		referenceId: string;
		slug: string;
		notes: string;
		anchorText: string | null;
		createdAt: Date;
		updatedAt: Date;
	};

	type SourceReference = { id: string; citeKey: string } | null;

	let {
		subnotes,
		sourceReference,
		projectRefs,
		onscrolltoannotation,
		onloadrefs,
		onassignreference,
		onsavesubnote,
		ondeletesubnote
	}: {
		subnotes: Subnote[];
		sourceReference: SourceReference;
		projectRefs: { id?: string; citeKey: string }[];
		onscrolltoannotation?: (id: number) => void;
		onloadrefs?: () => void;
		onassignreference?: (refId: string) => Promise<void>;
		onsavesubnote?: (id: number, notes: string) => Promise<void>;
		ondeletesubnote?: (id: number) => Promise<void>;
	} = $props();

	let editingSubnoteId = $state<number | null>(null);
	let editingSubnoteNotes = $state('');
	let assigningReference = $state(false);
	let assignRefId = $state('');

	async function handleAssign() {
		if (!assignRefId) return;
		await onassignreference?.(assignRefId);
		assigningReference = false;
		assignRefId = '';
	}

	async function handleSave(id: number) {
		await onsavesubnote?.(id, editingSubnoteNotes);
		editingSubnoteId = null;
	}
</script>

<div
	class="flex w-72 shrink-0 flex-col overflow-hidden border-l border-paper-border bg-paper dark:border-dark-paper-border dark:bg-dark-paper"
>
	<div
		class="flex items-center justify-between border-b border-paper-border px-4 py-3 dark:border-dark-paper-border"
	>
		<h3 class="font-serif text-sm font-semibold text-ink dark:text-dark-ink">Anotaciones</h3>
		{#if sourceReference}
			<span class="font-mono text-xs text-ink-faint dark:text-dark-ink-faint"
				>@{sourceReference.citeKey}</span
			>
		{/if}
	</div>

	<div class="flex-1 space-y-2 overflow-y-auto p-3">
		{#if !sourceReference}
			<div class="px-1 py-6 text-center">
				<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
					Sin referencia bibliográfica.
				</p>
				<p class="mt-1 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
					Asigna una referencia para poder anotar este documento.
				</p>
				{#if !assigningReference}
					<button
						onclick={() => {
							onloadrefs?.();
							assigningReference = true;
						}}
						class="mt-3 rounded-md bg-accent px-3 py-1.5 font-sans text-xs font-medium text-white hover:bg-accent/90"
					>
						Asignar referencia
					</button>
				{:else}
					<div class="mt-3 text-left">
						<select
							bind:value={assignRefId}
							class="w-full rounded-md border border-paper-border bg-paper-ui px-2 py-1.5 font-sans text-xs text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
						>
							<option value="">— elige referencia —</option>
							{#each projectRefs as ref (ref.id ?? ref.citeKey)}
								<option value={ref.id ?? ''}>{ref.citeKey}</option>
							{/each}
						</select>
						<div class="mt-2 flex gap-2">
							<button
								onclick={handleAssign}
								disabled={!assignRefId}
								class="flex-1 rounded-md bg-accent py-1.5 font-sans text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50"
							>
								Guardar
							</button>
							<button
								onclick={() => {
									assigningReference = false;
									assignRefId = '';
								}}
								class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-xs text-ink-muted hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted"
							>
								Cancelar
							</button>
						</div>
					</div>
				{/if}
			</div>
		{:else if subnotes.length === 0}
			<p class="px-1 py-6 text-center font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				Sin anotaciones.<br />
				<span class="text-xs text-ink-faint dark:text-dark-ink-faint"
					>Selecciona texto para anotar.</span
				>
			</p>
		{:else}
			{#each subnotes as s (s.id)}
				<div
					class="rounded-lg border border-paper-border bg-paper p-3 dark:border-dark-paper-border dark:bg-dark-paper"
				>
					<div class="mb-1.5 flex items-center justify-between gap-2">
						<button
							onclick={() => s.anchorText && onscrolltoannotation?.(s.id)}
							class="font-mono text-xs font-semibold text-accent {s.anchorText
								? 'cursor-pointer hover:underline'
								: 'cursor-default'}"
							disabled={!s.anchorText}
						>
							:{s.slug}
						</button>
						<div class="flex items-center gap-1">
							<button
								onclick={() => {
									editingSubnoteId = s.id;
									editingSubnoteNotes = s.notes;
								}}
								class="rounded p-0.5 text-ink-faint transition-colors hover:text-ink dark:text-ink-faint dark:hover:text-dark-ink"
								aria-label="Editar"
							>
								<svg
									width="12"
									height="12"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
									<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
								</svg>
							</button>
							<button
								onclick={() => ondeletesubnote?.(s.id)}
								class="rounded p-0.5 text-ink-faint transition-colors hover:text-red-500 dark:text-dark-ink-faint"
								aria-label="Eliminar"
							>
								<svg
									width="12"
									height="12"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<polyline points="3 6 5 6 21 6" />
									<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
									<path d="M10 11v6M14 11v6" />
									<path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
								</svg>
							</button>
						</div>
					</div>

					{#if s.anchorText}
						<blockquote
							class="mb-2 border-l-2 border-accent bg-accent/5 px-2.5 py-1.5 font-serif text-xs leading-relaxed text-ink-muted italic dark:text-dark-ink-muted"
						>
							"{s.anchorText}"
						</blockquote>
					{/if}

					{#if editingSubnoteId === s.id}
						<textarea
							class="w-full resize-none rounded border border-paper-border bg-paper-ui px-2 py-1.5 font-sans text-xs text-ink outline-none focus:border-accent dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
							rows="4"
							bind:value={editingSubnoteNotes}
							onkeydown={(e) => {
								if (e.key === 'Escape') editingSubnoteId = null;
							}}
						></textarea>
						<div class="mt-1.5 flex gap-2">
							<button
								onclick={() => handleSave(s.id)}
								class="rounded bg-accent px-2 py-0.5 font-sans text-xs text-white hover:bg-accent/90"
							>
								Guardar
							</button>
							<button
								onclick={() => (editingSubnoteId = null)}
								class="rounded px-2 py-0.5 font-sans text-xs text-ink-faint hover:text-ink dark:text-dark-ink-faint"
							>
								Cancelar
							</button>
						</div>
					{:else if s.notes}
						<p class="whitespace-pre-wrap font-sans text-xs leading-relaxed text-ink dark:text-dark-ink">
							{s.notes}
						</p>
					{/if}
				</div>
			{/each}
		{/if}
	</div>
</div>
