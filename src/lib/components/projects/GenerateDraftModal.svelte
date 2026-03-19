<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { trpc } from '$lib/utils/trpc';

	type Document = { id: string; title: string; type: string };

	let {
		projectId,
		documents,
		onclose,
		oncreated
	}: {
		projectId: string;
		documents: Document[];
		onclose: () => void;
		oncreated: (documentId: string) => void;
	} = $props();

	const outputTypeOptions = [
		{ value: 'full_paper', label: 'Artículo completo' },
		{ value: 'introduction', label: 'Introducción' },
		{ value: 'abstract', label: 'Resumen (Abstract)' },
		{ value: 'discussion', label: 'Discusión' },
		{ value: 'conclusion', label: 'Conclusión' },
		{ value: 'methodology', label: 'Metodología' },
		{ value: 'literature_review', label: 'Revisión de literatura' }
	] as const;

	const styleOptions = [
		{ value: 'formal', label: 'Formal y riguroso' },
		{ value: 'technical', label: 'Técnico y detallado' },
		{ value: 'review', label: 'Revisión crítica' }
	] as const;

	const audienceOptions = [
		{ value: 'experts', label: 'Expertos en el área' },
		{ value: 'general', label: 'Público general' },
		{ value: 'students', label: 'Estudiantes universitarios' }
	] as const;

	let selectedDocIds = new SvelteSet<string>(untrack(() => documents.map((d) => d.id)));
	let outputType = $state<(typeof outputTypeOptions)[number]['value']>('full_paper');
	let style = $state<(typeof styleOptions)[number]['value']>('formal');
	let audience = $state<(typeof audienceOptions)[number]['value']>('experts');
	let extraInstructions = $state('');
	let loading = $state(false);
	let error = $state('');

	function toggleDoc(id: string) {
		if (selectedDocIds.has(id)) selectedDocIds.delete(id);
		else selectedDocIds.add(id);
	}

	function selectAll() {
		documents.forEach((d) => selectedDocIds.add(d.id));
	}

	function selectNone() {
		selectedDocIds.clear();
	}

	async function generate() {
		loading = true;
		error = '';
		try {
			const result = await trpc.ai.generateDraft.mutate({
				projectId,
				documentIds: [...selectedDocIds],
				outputType,
				style,
				audience,
				extraInstructions: extraInstructions.trim() || undefined
			});
			oncreated(result.documentId);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Error al generar el borrador';
			loading = false;
		}
	}

	function handleBackdrop(e: MouseEvent) {
		if (e.target === e.currentTarget) onclose();
	}

	const docTypeLabel: Record<string, string> = {
		paper: 'Artículo',
		notes: 'Notas',
		outline: 'Esquema',
		bibliography: 'Bibliografía',
		supplementary: 'Suplementario'
	};
</script>

<!-- Backdrop -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
	onclick={handleBackdrop}
>
	<div
		class="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-paper-border bg-paper shadow-2xl dark:border-dark-paper-border dark:bg-dark-paper"
	>
		<!-- Header -->
		<div class="flex items-center justify-between border-b border-paper-border px-6 py-4 dark:border-dark-paper-border">
			<h2 class="font-serif text-lg font-semibold text-ink dark:text-dark-ink">
				Generar borrador con IA
			</h2>
			<button
				onclick={onclose}
				class="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-paper-ui hover:text-ink dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui dark:hover:text-dark-ink"
				aria-label="Cerrar"
			>
				<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
					<path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
				</svg>
			</button>
		</div>

		<!-- Body (scrollable) -->
		<div class="flex-1 overflow-y-auto px-6 py-5 space-y-5">
			<!-- Output type -->
			<div>
				<label for="output-type" class="mb-1.5 block font-sans text-sm font-medium text-ink dark:text-dark-ink">
					Tipo de borrador
				</label>
				<select
					id="output-type"
					bind:value={outputType}
					class="w-full rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
				>
					{#each outputTypeOptions as opt (opt.value)}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
			</div>

			<!-- Style + Audience -->
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label for="draft-style" class="mb-1.5 block font-sans text-sm font-medium text-ink dark:text-dark-ink">
						Estilo
					</label>
					<select
						id="draft-style"
						bind:value={style}
						class="w-full rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
					>
						{#each styleOptions as opt (opt.value)}
							<option value={opt.value}>{opt.label}</option>
						{/each}
					</select>
				</div>
				<div>
					<label for="draft-audience" class="mb-1.5 block font-sans text-sm font-medium text-ink dark:text-dark-ink">
						Audiencia
					</label>
					<select
						id="draft-audience"
						bind:value={audience}
						class="w-full rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
					>
						{#each audienceOptions as opt (opt.value)}
							<option value={opt.value}>{opt.label}</option>
						{/each}
					</select>
				</div>
			</div>

			<!-- Context documents -->
			<div>
				<div class="mb-1.5 flex items-center justify-between">
					<span class="font-sans text-sm font-medium text-ink dark:text-dark-ink">
						Documentos de contexto
					</span>
					<div class="flex gap-2">
						<button
							onclick={selectAll}
							class="font-sans text-xs text-accent hover:underline"
						>Todos</button>
						<span class="text-ink-faint dark:text-dark-ink-faint">·</span>
						<button
							onclick={selectNone}
							class="font-sans text-xs text-ink-muted hover:underline dark:text-dark-ink-muted"
						>Ninguno</button>
					</div>
				</div>
				{#if documents.length === 0}
					<p class="font-sans text-sm text-ink-faint dark:text-dark-ink-faint">
						No hay documentos en este proyecto.
					</p>
				{:else}
					<div class="flex flex-col gap-1 rounded-xl border border-paper-border bg-paper-ui p-2 dark:border-dark-paper-border dark:bg-dark-paper-ui">
						{#each documents as doc (doc.id)}
							<label class="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 transition-colors hover:bg-paper dark:hover:bg-dark-paper">
								<input
									type="checkbox"
									checked={selectedDocIds.has(doc.id)}
									onchange={() => toggleDoc(doc.id)}
									class="h-4 w-4 rounded border-paper-border accent-accent"
								/>
								<span class="min-w-0 flex-1">
									<span class="block truncate font-sans text-sm text-ink dark:text-dark-ink">{doc.title}</span>
									<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">{docTypeLabel[doc.type] ?? doc.type}</span>
								</span>
							</label>
						{/each}
					</div>
					<p class="mt-1 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
						{selectedDocIds.size} de {documents.length} seleccionados
					</p>
				{/if}
			</div>

			<!-- Extra instructions -->
			<div>
				<label for="extra-instructions" class="mb-1.5 block font-sans text-sm font-medium text-ink dark:text-dark-ink">
					Instrucciones adicionales <span class="font-normal text-ink-faint dark:text-dark-ink-faint">(opcional)</span>
				</label>
				<textarea
					id="extra-instructions"
					bind:value={extraInstructions}
					placeholder="Ej: Enfócate en los resultados de la sección 3. Usa terminología de biología molecular."
					rows={3}
					maxlength={1000}
					class="w-full resize-none rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
				></textarea>
			</div>

			{#if error}
				<p class="rounded-lg bg-red-50 px-3 py-2 font-sans text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">{error}</p>
			{/if}
		</div>

		<!-- Footer -->
		<div class="flex items-center justify-end gap-2 border-t border-paper-border px-6 py-4 dark:border-dark-paper-border">
			<button
				onclick={onclose}
				disabled={loading}
				class="rounded-md border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui disabled:opacity-50 dark:border-dark-paper-border dark:text-dark-ink-muted"
			>
				Cancelar
			</button>
			<button
				onclick={generate}
				disabled={loading}
				class="flex items-center gap-2 rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
			>
				{#if loading}
					<svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
						<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
					</svg>
					Generando…
				{:else}
					Generar borrador
				{/if}
			</button>
		</div>
	</div>
</div>
