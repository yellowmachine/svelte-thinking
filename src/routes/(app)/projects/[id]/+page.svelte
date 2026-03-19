<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import DocumentItem from '$lib/components/documents/DocumentItem.svelte';
	import InviteCollaborator from '$lib/components/projects/InviteCollaborator.svelte';
	import GenerateDraftModal from '$lib/components/projects/GenerateDraftModal.svelte';
	import { trpc } from '$lib/utils/trpc';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type InvitationType = {
		id: string;
		invitedEmail: string;
		role: 'author' | 'coauthor' | 'reviewer' | 'commenter';
		status: string;
		expiresAt: Date;
	};

	const documents = $derived(data.documents);
	const invitations: InvitationType[] = $derived(
		data.invitations.map((inv) => ({
			...inv,
			role: inv.role as 'author' | 'coauthor' | 'reviewer' | 'commenter'
		}))
	);

	let showCreateDoc = $state(false);
	let showGenerateDraft = $state(false);
	let newDocTitle = $state('');
	let newDocType: 'paper' | 'notes' | 'outline' | 'bibliography' | 'supplementary' =
		$state('paper');
	let creatingDoc = $state(false);
	let createDocError = $state('');

	const docTypeOptions = [
		{ value: 'paper' as const, label: 'Artículo' },
		{ value: 'notes' as const, label: 'Notas' },
		{ value: 'outline' as const, label: 'Esquema' },
		{ value: 'bibliography' as const, label: 'Bibliografía' },
		{ value: 'supplementary' as const, label: 'Suplementario' }
	];

	async function createDocument() {
		if (!newDocTitle.trim()) return;
		creatingDoc = true;
		createDocError = '';
		try {
			const doc = await trpc.documents.create.mutate({
				projectId: data.project.id,
				title: newDocTitle.trim(),
				type: newDocType
			});
			window.location.href = `/projects/${data.project.id}/documents/${doc.id}`;
		} catch (e) {
			createDocError = e instanceof Error ? e.message : 'Error al crear el documento';
			creatingDoc = false;
		}
	}

	async function reloadInvitations() {
		await invalidateAll();
	}

	// Datasets
	type Dataset = { id: string; filename: string; size: number; mimeType: string; createdAt: Date };
	let datasets = $state<Dataset[]>([]);
	let uploadingDataset = $state(false);
	let datasetError = $state('');

	async function loadDatasets() {
		try {
			const res = await fetch(`/api/projects/${data.project.id}/datasets`);
			if (res.ok) datasets = await res.json();
		} catch { /* non-critical */ }
	}

	async function uploadDataset(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		uploadingDataset = true;
		datasetError = '';
		const form = new FormData();
		form.append('file', file);

		try {
			const res = await fetch(`/api/projects/${data.project.id}/datasets`, {
				method: 'POST',
				body: form
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({ message: 'Error al subir' }));
				throw new Error(err.message);
			}
			await loadDatasets();
		} catch (err) {
			datasetError = err instanceof Error ? err.message : 'Error al subir dataset';
		} finally {
			uploadingDataset = false;
			input.value = '';
		}
	}

	async function deleteDataset(id: string) {
		await fetch(`/api/projects/${data.project.id}/datasets?datasetId=${id}`, { method: 'DELETE' });
		datasets = datasets.filter((d) => d.id !== id);
	}

	function formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	$effect(() => { loadDatasets(); });

	// ── Context links ────────────────────────────────────────────────────────

	type ContextLink = {
		id: string;
		linkedDocumentId: string;
		docTitle: string;
		docType: string;
		sourceProjectId: string;
		sourceProjectTitle: string;
	};
	type AvailableDoc = {
		id: string;
		title: string;
		type: string;
		projectId: string;
		projectTitle: string;
	};

	let contextLinks = $state<ContextLink[]>([]);
	let showContextPicker = $state(false);
	let availableDocs = $state<AvailableDoc[]>([]);
	let contextPickerSearch = $state('');
	let loadingAvailable = $state(false);

	async function loadContextLinks() {
		try {
			contextLinks = await trpc.contextLinks.list.query(data.project.id);
		} catch { /* non-critical */ }
	}

	async function openContextPicker() {
		showContextPicker = true;
		loadingAvailable = true;
		try {
			availableDocs = await trpc.contextLinks.listAvailable.query(data.project.id);
		} finally {
			loadingAvailable = false;
		}
	}

	async function addContextLink(docId: string) {
		await trpc.contextLinks.add.mutate({ projectId: data.project.id, documentId: docId });
		await loadContextLinks();
	}

	async function removeContextLink(linkId: string) {
		await trpc.contextLinks.remove.mutate(linkId);
		contextLinks = contextLinks.filter((l) => l.id !== linkId);
	}

	const filteredAvailable = $derived(() => {
		const q = contextPickerSearch.toLowerCase().trim();
		const linkedIds = new Set(contextLinks.map((l) => l.linkedDocumentId));
		const unlinked = availableDocs.filter((d) => !linkedIds.has(d.id));
		if (!q) return unlinked;
		return unlinked.filter(
			(d) =>
				d.title.toLowerCase().includes(q) ||
				d.projectTitle.toLowerCase().includes(q)
		);
	});

	// Group available docs by project
	const availableByProject = $derived(() => {
		const groups = new Map<string, { title: string; docs: AvailableDoc[] }>();
		for (const doc of filteredAvailable()) {
			if (!groups.has(doc.projectId)) {
				groups.set(doc.projectId, { title: doc.projectTitle, docs: [] });
			}
			groups.get(doc.projectId)!.docs.push(doc);
		}
		return [...groups.entries()].map(([id, g]) => ({ id, ...g }));
	});

	$effect(() => { loadContextLinks(); });

	const statusLabel: Record<string, string> = {
		draft: 'Borrador',
		active: 'Activo',
		review: 'En revisión',
		published: 'Publicado',
		archived: 'Archivado'
	};

	const roleLabel: Record<string, string> = {
		owner: 'Propietario',
		author: 'Autor',
		coauthor: 'Coautor',
		reviewer: 'Revisor',
		commenter: 'Comentarista'
	};
</script>

<div class="mx-auto max-w-5xl px-6 py-8">
	<!-- Header -->
	<div class="mb-8">
		<button
			onclick={() => (window.location.href = '/projects')}
			class="mb-4 flex items-center gap-1.5 font-sans text-sm text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
		>
			<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
				<path
					d="M10 12L6 8l4-4"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
			Proyectos
		</button>

		<div class="flex items-start justify-between gap-4">
			<div>
				<h1 class="font-serif text-3xl font-semibold text-ink dark:text-dark-ink">
					{data.project.title}
				</h1>
				{#if data.project.description}
					<p class="mt-2 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
						{data.project.description}
					</p>
				{/if}
			</div>
			<span
				class="shrink-0 rounded-full bg-paper-border px-3 py-1 font-sans text-xs font-medium text-ink-muted dark:bg-dark-paper-border dark:text-dark-ink-muted"
			>
				{statusLabel[data.project.status] ?? data.project.status}
			</span>
		</div>

		{#if data.myRole}
			<p class="mt-2 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
				Tu rol: <span class="font-medium text-accent">{roleLabel[data.myRole] ?? data.myRole}</span>
				· {data.collaborators.length}
				{data.collaborators.length === 1 ? 'colaborador' : 'colaboradores'}
			</p>
		{/if}
	</div>

	<div class="grid gap-8 lg:grid-cols-3">
		<!-- Documents section -->
		<div class="lg:col-span-2">
			<div class="mb-4 flex items-center justify-between">
				<h2 class="font-serif text-xl font-semibold text-ink dark:text-dark-ink">Documentos</h2>
				<div class="flex items-center gap-2">
					<a
						href="/projects/{data.project.id}/ai"
						class="flex items-center gap-1.5 rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						Asistente
					</a>
					<button
						onclick={() => (showGenerateDraft = true)}
						class="flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/5 px-3 py-1.5 font-sans text-sm text-accent transition-colors hover:bg-accent/10 dark:border-accent/30 dark:bg-accent/10 dark:hover:bg-accent/20"
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						Generar borrador
					</button>
					<a
						href="/projects/{data.project.id}/photos"
						class="flex items-center gap-1.5 rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5"/>
							<circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" stroke-width="1.5"/>
							<path d="M21 15l-5-5L5 21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						Fotos
					</a>
					<a
						href="/projects/{data.project.id}/bib"
						class="flex items-center gap-1.5 rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path d="M4 19.5A2.5 2.5 0 016.5 17H20" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
							<path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
						</svg>
						Bibliografía
					</a>
					<button
						onclick={() => (showCreateDoc = !showCreateDoc)}
						class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
					>
						+ Nuevo
					</button>
				</div>
			</div>

			<!-- Create document form -->
			{#if showCreateDoc}
				<div class="mb-4 rounded-xl border border-accent/30 bg-paper p-5 dark:bg-dark-paper">
					<div class="flex flex-col gap-3">
						<div class="flex gap-3">
							<input
								type="text"
								bind:value={newDocTitle}
								placeholder="Título del documento"
								class="flex-1 rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
							/>
							<select
								bind:value={newDocType}
								class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
							>
								{#each docTypeOptions as opt (opt.value)}
									<option value={opt.value}>{opt.label}</option>
								{/each}
							</select>
						</div>

						{#if createDocError}
							<p class="font-sans text-sm text-red-600 dark:text-red-400">{createDocError}</p>
						{/if}

						<div class="flex gap-2">
							<button
								onclick={createDocument}
								disabled={creatingDoc || !newDocTitle.trim()}
								class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
							>
								{creatingDoc ? 'Creando...' : 'Crear y abrir'}
							</button>
							<button
								onclick={() => (showCreateDoc = false)}
								class="rounded-md border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted"
							>
								Cancelar
							</button>
						</div>
					</div>
				</div>
			{/if}

			<!-- Document list -->
			{#if documents.length === 0}
				<div
					class="rounded-xl border border-dashed border-paper-border py-12 text-center dark:border-dark-paper-border"
				>
					<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
						Sin documentos. Crea el primero.
					</p>
				</div>
			{:else}
				<div
					class="flex flex-col gap-1 rounded-xl border border-paper-border bg-paper p-2 dark:border-dark-paper-border dark:bg-dark-paper"
				>
					{#each documents as doc (doc.id)}
						<DocumentItem
							title={doc.title}
							type={doc.type}
							onclick={() =>
								(window.location.href = `/projects/${data.project.id}/documents/${doc.id}`)}
						/>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Datasets -->
		<div class="mt-8">
			<div class="mb-3 flex items-center justify-between">
				<h2 class="font-serif text-lg font-semibold text-ink dark:text-dark-ink">Datasets</h2>
				<label class="cursor-pointer rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui {uploadingDataset ? 'opacity-50 pointer-events-none' : ''}">
					{uploadingDataset ? 'Subiendo…' : '+ Subir dataset'}
					<input type="file" class="hidden" accept=".csv,.tsv,.json,.xls,.xlsx" onchange={uploadDataset} disabled={uploadingDataset} />
				</label>
			</div>

			{#if datasetError}
				<p class="mb-2 font-sans text-sm text-red-600 dark:text-red-400">{datasetError}</p>
			{/if}

			{#if datasets.length === 0}
				<p class="font-sans text-sm text-ink-faint dark:text-dark-ink-faint">
					Sin datasets. Sube un CSV, TSV o JSON para referenciarlos en gráficos con <code class="rounded bg-paper-ui px-1 font-mono text-xs dark:bg-dark-paper-ui">"$ref": "dataset:nombre.csv"</code>.
				</p>
			{:else}
				<div class="flex flex-col gap-1 rounded-xl border border-paper-border bg-paper p-2 dark:border-dark-paper-border dark:bg-dark-paper">
					{#each datasets as dataset (dataset.id)}
						<div class="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-paper-ui dark:hover:bg-dark-paper-ui">
							<div class="min-w-0">
								<p class="truncate font-sans text-sm font-medium text-ink dark:text-dark-ink">{dataset.filename}</p>
								<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">{formatSize(dataset.size)}</p>
							</div>
							<button
								onclick={() => deleteDataset(dataset.id)}
								class="ml-3 shrink-0 font-sans text-xs text-ink-faint transition-colors hover:text-red-600 dark:text-dark-ink-faint dark:hover:text-red-400"
							>
								Eliminar
							</button>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Sidebar -->
		<div class="flex flex-col gap-6">
			{#if data.isOwner}
				<InviteCollaborator
					projectId={data.project.id}
					{invitations}
					oninvited={reloadInvitations}
				/>
			{:else}
				<div
					class="rounded-xl border border-paper-border bg-paper p-5 dark:border-dark-paper-border dark:bg-dark-paper"
				>
					<h3 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">
						Colaboradores
					</h3>
					<p class="mt-2 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
						{data.collaborators.length}
						{data.collaborators.length === 1 ? 'colaborador' : 'colaboradores'}
					</p>
				</div>
			{/if}

			<!-- Context links for AI -->
			<div class="rounded-xl border border-paper-border bg-paper p-5 dark:border-dark-paper-border dark:bg-dark-paper">
				<div class="mb-3 flex items-center justify-between gap-2">
					<div>
						<h3 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">Contexto externo</h3>
						<p class="mt-0.5 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">Documentos de otros proyectos visibles por la IA</p>
					</div>
					<button
						onclick={openContextPicker}
						class="shrink-0 rounded-md border border-paper-border px-2.5 py-1 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
					>
						+ Añadir
					</button>
				</div>

				{#if contextLinks.length === 0}
					<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
						Sin documentos externos. Añade notas de otros proyectos para que la IA los use como contexto.
					</p>
				{:else}
					<div class="flex flex-col gap-1">
						{#each contextLinks as link (link.id)}
							<div class="group flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-paper-ui dark:hover:bg-dark-paper-ui">
								<div class="min-w-0 flex-1">
									<p class="truncate font-sans text-xs font-medium text-ink dark:text-dark-ink">{link.docTitle}</p>
									<p class="truncate font-sans text-[11px] text-ink-faint dark:text-dark-ink-faint">{link.sourceProjectTitle}</p>
								</div>
								<button
									onclick={() => removeContextLink(link.id)}
									class="mt-0.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 font-sans text-[11px] text-ink-faint hover:text-red-500 dark:text-dark-ink-faint dark:hover:text-red-400"
									title="Quitar"
								>
									✕
								</button>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>

{#if showContextPicker}
	<!-- Context doc picker modal -->
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
		<div class="flex w-full max-w-md flex-col rounded-2xl border border-paper-border bg-paper shadow-2xl dark:border-dark-paper-border dark:bg-dark-paper" style="max-height: 80vh">
			<div class="flex items-center justify-between border-b border-paper-border px-5 py-4 dark:border-dark-paper-border">
				<h2 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">Añadir contexto externo</h2>
				<button
					onclick={() => { showContextPicker = false; contextPickerSearch = ''; }}
					class="rounded-md p-1 text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
					aria-label="Cerrar"
				>
					<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
						<path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
					</svg>
				</button>
			</div>

			<div class="px-5 pt-3">
				<input
					type="search"
					bind:value={contextPickerSearch}
					placeholder="Buscar documentos o proyectos…"
					class="w-full rounded-lg border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
				/>
			</div>

			<div class="flex-1 overflow-y-auto px-5 py-3">
				{#if loadingAvailable}
					<p class="py-4 text-center font-sans text-sm text-ink-faint dark:text-dark-ink-faint">Cargando…</p>
				{:else if availableByProject().length === 0}
					<p class="py-4 text-center font-sans text-sm text-ink-faint dark:text-dark-ink-faint">
						{availableDocs.length === 0 ? 'No tienes documentos en otros proyectos' : 'Todos los documentos ya están añadidos'}
					</p>
				{:else}
					{#each availableByProject() as group (group.id)}
						<div class="mb-3">
							<p class="mb-1 font-sans text-[11px] font-semibold uppercase tracking-wide text-ink-faint dark:text-dark-ink-faint">{group.title}</p>
							{#each group.docs as doc (doc.id)}
								<button
									onclick={async () => { await addContextLink(doc.id); }}
									class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-paper-ui dark:hover:bg-dark-paper-ui"
								>
									<span class="min-w-0 flex-1 truncate font-sans text-sm text-ink dark:text-dark-ink">{doc.title}</span>
									<span class="shrink-0 rounded-full bg-paper-ui px-2 py-0.5 font-sans text-[10px] text-ink-faint dark:bg-dark-paper-ui dark:text-dark-ink-faint">{doc.type}</span>
								</button>
							{/each}
						</div>
					{/each}
				{/if}
			</div>
		</div>
	</div>
{/if}

{#if showGenerateDraft}
	<GenerateDraftModal
		projectId={data.project.id}
		documents={documents}
		onclose={() => (showGenerateDraft = false)}
		oncreated={(docId) => {
			showGenerateDraft = false;
			window.location.href = `/projects/${data.project.id}/documents/${docId}`;
		}}
	/>
{/if}
