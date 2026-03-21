<script lang="ts">
	import { trpc } from '$lib/utils/trpc';
	import RequirementItem from '$lib/components/projects/RequirementItem.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Requirement = (typeof data.requirements)[number];

	let requirements = $state<Requirement[]>(data.requirements);
	let documents = $derived(data.documents);

	// ── Generate ──────────────────────────────────────────────────────────────
	let description = $state('');
	let generating = $state(false);
	let generateError = $state('');

	async function generate() {
		if (!description.trim() || generating) return;
		generating = true;
		generateError = '';
		try {
			const result = await trpc.requirements.generate.mutate({
				projectId: data.project.id,
				description: description.trim()
			});
			requirements = result;
			description = '';
		} catch (e) {
			generateError = e instanceof Error ? e.message : 'Error al generar requisitos';
		} finally {
			generating = false;
		}
	}

	// ── Fulfill ───────────────────────────────────────────────────────────────
	let openPickerId = $state<string | null>(null);
	let fulfilling = $state<string | null>(null);

	async function fulfill(requirementId: string, documentId: string) {
		fulfilling = requirementId;
		try {
			await trpc.requirements.fulfill.mutate({ requirementId, documentId });
			requirements = requirements.map((r) =>
				r.id === requirementId ? { ...r, fulfilledDocumentId: documentId } : r
			);
		} finally {
			fulfilling = null;
			openPickerId = null;
		}
	}

	async function unfulfill(requirementId: string) {
		fulfilling = requirementId;
		try {
			await trpc.requirements.unfulfill.mutate(requirementId);
			requirements = requirements.map((r) =>
				r.id === requirementId ? { ...r, fulfilledDocumentId: null } : r
			);
		} finally {
			fulfilling = null;
		}
	}

	// ── Delete single ─────────────────────────────────────────────────────────
	async function deleteRequirement(id: string) {
		await trpc.requirements.delete.mutate(id);
		requirements = requirements.filter((r) => r.id !== id);
	}

	// ── PDF export ────────────────────────────────────────────────────────────
	let exportingPdf = $state(false);
	let exportError = $state('');

	async function downloadPdf() {
		if (exportingPdf) return;
		exportingPdf = true;
		exportError = '';
		try {
			const res = await fetch(`/api/projects/${data.project.id}/pdf`);
			if (!res.ok) {
				const msg = await res.text().catch(() => `Error ${res.status}`);
				throw new Error(msg);
			}
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `${data.project.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`;
			a.click();
			URL.revokeObjectURL(url);
		} catch (e) {
			exportError = e instanceof Error ? e.message : 'Error al generar el PDF';
		} finally {
			exportingPdf = false;
		}
	}

	// ── Progress ──────────────────────────────────────────────────────────────
	const fulfilled = $derived(requirements.filter((r) => r.fulfilledDocumentId !== null).length);
	const total = $derived(requirements.length);
	const requiredTotal = $derived(requirements.filter((r) => r.required).length);
	const requiredFulfilled = $derived(
		requirements.filter((r) => r.required && r.fulfilledDocumentId !== null).length
	);
	const progress = $derived(total > 0 ? Math.round((fulfilled / total) * 100) : 0);
	const allRequiredDone = $derived(requiredFulfilled === requiredTotal && requiredTotal > 0);

</script>

<div class="mx-auto max-w-3xl px-6 py-8">
	<!-- Header -->
	<div class="mb-8">
		<a
			href="/projects/{data.project.id}"
			class="mb-4 flex items-center gap-1.5 font-sans text-sm text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
		>
			<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
				<path d="M10 12L6 8l4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
			{data.project.title}
		</a>

		<div class="flex items-center justify-between gap-4">
			<h1 class="font-serif text-3xl font-semibold text-ink dark:text-dark-ink">Requisitos</h1>

			{#if requirements.length > 0 && data.isOwner}
				<button
					onclick={() => { requirements = []; }}
					class="font-sans text-sm text-ink-muted underline-offset-2 hover:text-ink hover:underline dark:text-dark-ink-muted dark:hover:text-dark-ink"
				>
					Regenerar
				</button>
			{/if}
		</div>

		{#if requirements.length > 0}
			<div class="mt-4">
				<div class="mb-1.5 flex items-center justify-between font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					<span>{fulfilled} de {total} completados</span>
					{#if allRequiredDone}
						<span class="font-medium text-green-600 dark:text-green-400">Todos los obligatorios listos</span>
					{:else}
						<span>{requiredFulfilled} de {requiredTotal} obligatorios</span>
					{/if}
				</div>
				<div class="h-1.5 w-full overflow-hidden rounded-full bg-paper-border dark:bg-dark-paper-border">
					<div
						class="h-full rounded-full transition-all duration-300 {allRequiredDone ? 'bg-green-500' : 'bg-accent'}"
						style="width: {progress}%"
					></div>
				</div>
			</div>
		{/if}
	</div>

	<!-- Generate form (shown when no requirements exist) -->
	{#if requirements.length === 0}
		<div class="rounded-xl border border-paper-border bg-paper-ui p-6 dark:border-dark-paper-border dark:bg-dark-paper-ui">
			<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">
				Generar requisitos con IA
			</h2>
			<p class="mb-4 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
				Describe el tipo de documento que quieres crear y la IA generará automáticamente la lista de secciones y requisitos necesarios.
			</p>

			<textarea
				bind:value={description}
				placeholder="Ej: divulgación médica sobre tratamiento de hipertensión, artículo de revisión sistemática, tesis doctoral en filosofía…"
				rows={3}
				disabled={generating}
				class="w-full resize-none rounded-lg border border-paper-border bg-paper px-3 py-2.5 font-sans text-sm leading-relaxed text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none disabled:opacity-50 dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink dark:placeholder:text-dark-ink-faint dark:focus:border-accent"
			></textarea>

			{#if generateError}
				<p class="mt-2 font-sans text-sm text-red-500">{generateError}</p>
			{/if}

			<button
				onclick={generate}
				disabled={!description.trim() || generating}
				class="mt-3 flex items-center gap-2 rounded-lg bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
			>
				{#if generating}
					<svg class="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
						<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" stroke-dasharray="32" stroke-dashoffset="12" />
					</svg>
					Generando…
				{:else}
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
						<path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" />
					</svg>
					Generar requisitos
				{/if}
			</button>
		</div>

	<!-- Requirements list -->
	{:else}
		<ul class="space-y-3">
			{#each requirements as req (req.id)}
				<RequirementItem
					requirement={req}
					{documents}
					projectId={data.project.id}
					isOwner={data.isOwner}
					pickerOpen={openPickerId === req.id}
					fulfilling={fulfilling === req.id}
					onfulfill={(docId) => fulfill(req.id, docId)}
					onunfulfill={() => unfulfill(req.id)}
					ondelete={() => deleteRequirement(req.id)}
					ontogglePicker={() => (openPickerId = openPickerId === req.id ? null : req.id)}
				/>
			{/each}
		</ul>

		<!-- Generate PDF CTA -->
		{#if allRequiredDone}
			<div class="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-900/40 dark:bg-green-950/20">
				<div class="flex items-center justify-between gap-4">
					<div>
						<p class="font-sans text-sm font-semibold text-green-800 dark:text-green-300">Proyecto completo</p>
						<p class="font-sans text-xs text-green-700 dark:text-green-400">
							{#if exportingPdf}
								Compilando con Typst, puede tardar unos segundos…
							{:else if exportError}
								{exportError}
							{:else}
								Todos los requisitos obligatorios están cubiertos.
							{/if}
						</p>
					</div>
					<button
						onclick={downloadPdf}
						disabled={exportingPdf}
						class="flex shrink-0 items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-70"
					>
						{#if exportingPdf}
							<svg class="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
								<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" stroke-dasharray="32" stroke-dashoffset="12" />
							</svg>
							Generando…
						{:else}
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
								<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
								<polyline points="7 10 12 15 17 10"/>
								<line x1="12" y1="15" x2="12" y2="3"/>
							</svg>
							Exportar PDF
						{/if}
					</button>
				</div>
			</div>
		{/if}
	{/if}
</div>
