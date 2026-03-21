<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { trpc } from '$lib/utils/trpc';
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

	// ── Progress ──────────────────────────────────────────────────────────────
	const fulfilled = $derived(requirements.filter((r) => r.fulfilledDocumentId !== null).length);
	const total = $derived(requirements.length);
	const requiredTotal = $derived(requirements.filter((r) => r.required).length);
	const requiredFulfilled = $derived(
		requirements.filter((r) => r.required && r.fulfilledDocumentId !== null).length
	);
	const progress = $derived(total > 0 ? Math.round((fulfilled / total) * 100) : 0);
	const allRequiredDone = $derived(requiredFulfilled === requiredTotal && requiredTotal > 0);

	// ── Doc title lookup ──────────────────────────────────────────────────────
	function docTitle(id: string | null): string {
		if (!id) return '';
		return documents.find((d) => d.id === id)?.title ?? '(documento eliminado)';
	}

	const docTypeLabel: Record<string, string> = {
		paper: 'Artículo',
		notes: 'Notas',
		outline: 'Esquema',
		bibliography: 'Bibliografía',
		supplementary: 'Suplementario'
	};
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
				{@const fulfilled = req.fulfilledDocumentId !== null}
				{@const isOpen = openPickerId === req.id}

				<li class="rounded-xl border transition-colors {fulfilled ? 'border-green-200 bg-green-50 dark:border-green-900/40 dark:bg-green-950/20' : 'border-paper-border bg-paper dark:border-dark-paper-border dark:bg-dark-paper'}">
					<div class="flex items-start gap-3 p-4">
						<!-- Check icon -->
						<div class="mt-0.5 shrink-0">
							{#if fulfilled}
								<div class="flex h-5 w-5 items-center justify-center rounded-full bg-green-500">
									<svg width="10" height="10" viewBox="0 0 12 12" fill="none">
										<path d="M2 6l3 3 5-5" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
									</svg>
								</div>
							{:else}
								<div class="h-5 w-5 rounded-full border-2 border-paper-border dark:border-dark-paper-border"></div>
							{/if}
						</div>

						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-2">
								<span class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">{req.name}</span>
								{#if !req.required}
									<span class="rounded-full bg-paper-border px-2 py-0.5 font-sans text-[10px] font-medium uppercase tracking-wide text-ink-faint dark:bg-dark-paper-border dark:text-dark-ink-faint">Opcional</span>
								{/if}
							</div>

							{#if req.description}
								<p class="mt-0.5 font-sans text-xs leading-relaxed text-ink-muted dark:text-dark-ink-muted">{req.description}</p>
							{/if}

							<!-- Fulfilled: show linked doc -->
							{#if fulfilled}
								<div class="mt-2 flex flex-wrap items-center gap-2">
									<a
										href="/projects/{data.project.id}/documents/{req.fulfilledDocumentId}"
										class="flex items-center gap-1.5 rounded-md border border-green-200 bg-white px-2.5 py-1 font-sans text-xs font-medium text-green-700 transition-colors hover:bg-green-50 dark:border-green-900/40 dark:bg-dark-paper dark:text-green-400 dark:hover:bg-green-950/30"
									>
										<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
											<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
											<polyline points="14 2 14 8 20 8" />
										</svg>
										{docTitle(req.fulfilledDocumentId)}
									</a>
									{#if data.isOwner}
										<button
											onclick={() => unfulfill(req.id)}
											disabled={fulfilling === req.id}
											class="font-sans text-xs text-ink-faint underline-offset-2 hover:text-ink hover:underline disabled:opacity-40 dark:text-dark-ink-faint dark:hover:text-dark-ink"
										>
											Cambiar
										</button>
									{/if}
								</div>

							<!-- Not fulfilled: picker or assign button -->
							{:else if data.isOwner}
								{#if isOpen}
									<div class="mt-2 rounded-lg border border-paper-border bg-paper-ui p-2 dark:border-dark-paper-border dark:bg-dark-paper-ui">
										{#if documents.length === 0}
											<p class="px-1 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">No hay documentos en este proyecto.</p>
										{:else}
											<ul class="max-h-44 space-y-0.5 overflow-y-auto">
												{#each documents as doc (doc.id)}
													<li>
														<button
															onclick={() => fulfill(req.id, doc.id)}
															disabled={fulfilling === req.id}
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
											onclick={() => (openPickerId = null)}
											class="mt-1.5 w-full rounded-md py-1 font-sans text-xs text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
										>
											Cancelar
										</button>
									</div>
								{:else}
									<button
										onclick={() => (openPickerId = req.id)}
										class="mt-2 flex items-center gap-1.5 font-sans text-xs text-accent underline-offset-2 hover:underline"
									>
										<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
											<line x1="12" y1="5" x2="12" y2="19" />
											<line x1="5" y1="12" x2="19" y2="12" />
										</svg>
										Asignar documento
									</button>
								{/if}
							{/if}
						</div>

						<!-- Delete button (owner only) -->
						{#if data.isOwner}
							<button
								onclick={() => deleteRequirement(req.id)}
								title="Eliminar requisito"
								class="shrink-0 rounded p-1 text-ink-faint opacity-0 transition-opacity hover:text-ink group-hover:opacity-100 dark:text-dark-ink-faint dark:hover:text-dark-ink [li:hover_&]:opacity-100"
							>
								<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
									<polyline points="3 6 5 6 21 6" />
									<path d="M19 6l-1 14H6L5 6" />
									<path d="M10 11v6M14 11v6" />
									<path d="M9 6V4h6v2" />
								</svg>
							</button>
						{/if}
					</div>
				</li>
			{/each}
		</ul>

		<!-- Generate PDF CTA -->
		{#if allRequiredDone}
			<div class="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-900/40 dark:bg-green-950/20">
				<div class="flex items-center justify-between gap-4">
					<div>
						<p class="font-sans text-sm font-semibold text-green-800 dark:text-green-300">Proyecto completo</p>
						<p class="font-sans text-xs text-green-700 dark:text-green-400">Todos los requisitos obligatorios están cubiertos.</p>
					</div>
					<a
						href="/api/projects/{data.project.id}/pdf"
						download
						class="flex shrink-0 items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90"
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
							<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
							<polyline points="7 10 12 15 17 10"/>
							<line x1="12" y1="15" x2="12" y2="3"/>
						</svg>
						Exportar
					</a>
				</div>
			</div>
		{/if}
	{/if}
</div>
