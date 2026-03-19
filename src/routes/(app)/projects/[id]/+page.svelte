<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import DocumentItem from '$lib/components/documents/DocumentItem.svelte';
	import InviteCollaborator from '$lib/components/projects/InviteCollaborator.svelte';
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

		<!-- Sidebar -->
		<div>
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
		</div>
	</div>
</div>
