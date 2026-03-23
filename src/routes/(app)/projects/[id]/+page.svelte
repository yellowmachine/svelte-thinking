<script lang="ts">
	import { invalidateAll, goto } from '$app/navigation';
	import DocumentItem from '$lib/components/documents/DocumentItem.svelte';
	import InviteCollaborator from '$lib/components/projects/InviteCollaborator.svelte';
	import GenerateDraftModal from '$lib/components/projects/GenerateDraftModal.svelte';
	import RequirementsProgress from '$lib/components/projects/RequirementsProgress.svelte';
	import SafeDeleteDialog from '$lib/components/ui/SafeDeleteDialog.svelte';
	import JupyterImportModal from '$lib/components/projects/JupyterImportModal.svelte';
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
	const canEdit = $derived(
		data.isOwner || data.myRole === 'author' || data.myRole === 'coauthor'
	);
	const invitations: InvitationType[] = $derived(
		data.invitations.map((inv) => ({
			...inv,
			role: inv.role as 'author' | 'coauthor' | 'reviewer' | 'commenter'
		}))
	);

	// ── Click-to-edit ────────────────────────────────────────────────────────
	type EditableField = 'title' | 'description' | 'notes' | 'doi' | 'version' | 'publishedAt';
	let editingField = $state<EditableField | null>(null);
	let editBuffer = $state('');
	let savingField = $state(false);

	function focusEl(node: HTMLElement) {
		node.focus();
	}

	function startEdit(field: EditableField) {
		if (!data.isOwner) return;
		const proj = data.project as typeof data.project & { notes?: string | null; doi?: string | null; version?: string | null; publishedAt?: Date | null };
		editBuffer =
			field === 'title' ? proj.title :
			field === 'description' ? (proj.description ?? '') :
			field === 'notes' ? (proj.notes ?? '') :
			field === 'doi' ? (proj.doi ?? '') :
			field === 'version' ? (proj.version ?? '') :
			field === 'publishedAt' ? (proj.publishedAt ? proj.publishedAt.toISOString().slice(0, 10) : '') :
			'';
		editingField = field;
	}

	function cancelEdit() {
		editingField = null;
	}

	async function saveField(field: EditableField) {
		if (savingField) return;
		if (field === 'title' && !editBuffer.trim()) {
			editingField = null;
			return;
		}
		savingField = true;
		try {
			await trpc.projects.update.mutate({
				id: data.project.id,
				...(field === 'title' ? { title: editBuffer.trim() } : {}),
				...(field === 'description' ? { description: editBuffer.trim() || null } : {}),
				...(field === 'notes' ? { notes: editBuffer.trim() || null } : {}),
				...(field === 'doi' ? { doi: editBuffer.trim() || null } : {}),
				...(field === 'version' ? { version: editBuffer.trim() || null } : {}),
				...(field === 'publishedAt' ? { publishedAt: editBuffer ? new Date(editBuffer) : null } : {})
			});
			await invalidateAll();
		} catch {
			// revert silently
		} finally {
			savingField = false;
			editingField = null;
		}
	}

	let showCreateDoc = $state(false);
	let showGenerateDraft = $state(false);
	let newDocTitle = $state('');
	let newDocType: 'paper' | 'notes' | 'outline' | 'bibliography' | 'supplementary' =
		$state('paper');
	let creatingDoc = $state(false);
	let createDocError = $state('');

	const docTypeOptions = [
		{ value: 'paper' as const, label: 'Article', description: 'Main document: thesis, article, essay.' },
		{ value: 'notes' as const, label: 'Notes', description: 'Ideas and annotations in progress.' },
		{ value: 'outline' as const, label: 'Outline', description: 'Index or hierarchical argument structure.' },
		{ value: 'bibliography' as const, label: 'Bibliography', description: 'List of references and sources.' },
		{ value: 'supplementary' as const, label: 'Supplementary', description: 'Annexes, appendices and supplementary material.' }
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
			createDocError = e instanceof Error ? e.message : 'Error creating document';
			creatingDoc = false;
		}
	}

	async function reloadInvitations() {
		await invalidateAll();
	}

	// Datasets
	type Dataset = { id: string; filename: string; size: number; mimeType: string; createdAt: Date };
	let datasets = $state<Dataset[]>([]);

	async function loadDatasets() {
		try {
			const res = await fetch(`/api/projects/${data.project.id}/datasets`);
			if (res.ok) datasets = await res.json();
		} catch { /* non-critical */ }
	}

	async function deleteDataset(id: string) {
		await fetch(`/api/projects/${data.project.id}/datasets?datasetId=${id}`, { method: 'DELETE' });
		datasets = datasets.filter((d) => d.id !== id);
	}

	// Notebooks
	type Notebook = { id: string; filename: string; size: number; languageName: string | null; createdAt: Date };
	let notebooks = $state<Notebook[]>([]);
	let uploadingNotebook = $state(false);
	let notebookError = $state('');
	let notebookDropdownOpen = $state(false);

	async function loadNotebooks() {
		try {
			const res = await fetch(`/api/projects/${data.project.id}/notebooks`);
			if (res.ok) notebooks = await res.json();
		} catch { /* non-critical */ }
	}

	async function uploadNotebook(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		notebookDropdownOpen = false;
		uploadingNotebook = true;
		notebookError = '';
		const form = new FormData();
		form.append('file', file);

		try {
			const res = await fetch(`/api/projects/${data.project.id}/notebooks`, {
				method: 'POST',
				body: form
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({ message: 'Upload error' }));
				throw new Error(err.message);
			}
			await loadNotebooks();
		} catch (err) {
			notebookError = err instanceof Error ? err.message : 'Error importing notebook';
		} finally {
			uploadingNotebook = false;
			input.value = '';
		}
	}

	async function deleteNotebook(id: string) {
		await fetch(`/api/projects/${data.project.id}/notebooks/${id}`, { method: 'DELETE' });
		notebooks = notebooks.filter((n) => n.id !== id);
	}

	let showJupyterModal = $state(false);

	// ── Delete project ────────────────────────────────────────────────────────
	let showDeleteProject = $state(false);
	let deletingProject = $state(false);

	async function handleDeleteProject() {
		deletingProject = true;
		try {
			await trpc.projects.delete.mutate(data.project.id);
			await goto('/projects');
		} catch {
			deletingProject = false;
			showDeleteProject = false;
		}
	}

	let showLeaveProject = $state(false);
	let leavingProject = $state(false);
	let showRemoveCollaborator = $state(false);
	let removingCollaborator = $state(false);
	let collaboratorToRemove = $state<{ userId: string; name: string } | null>(null);

	async function handleLeaveProject() {
		leavingProject = true;
		try {
			await trpc.projects.leave.mutate(data.project.id);
			await goto('/projects');
		} catch (e: unknown) {
			leavingProject = false;
			showLeaveProject = false;
			alert(e instanceof Error ? e.message : 'Error leaving project');
		}
	}

	async function handleRemoveCollaborator() {
		if (!collaboratorToRemove) return;
		removingCollaborator = true;
		try {
			await trpc.projects.removeCollaborator.mutate({ projectId: data.project.id, userId: collaboratorToRemove.userId });
			await invalidateAll();
		} finally {
			removingCollaborator = false;
			showRemoveCollaborator = false;
			collaboratorToRemove = null;
		}
	}

	function formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	$effect(() => { loadDatasets(); });
	$effect(() => { loadNotebooks(); });

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
		isPublic: boolean;
		projectTitle: string | null;
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
				(d.projectTitle?.toLowerCase() ?? '').includes(q)
		);
	});

	// Group available docs: own projects grouped by name, then public docs from others
	const availableByProject = $derived(() => {
		const groups = new Map<string, { title: string; docs: AvailableDoc[] }>();
		const publicOthers: AvailableDoc[] = [];

		for (const doc of filteredAvailable()) {
			if (doc.projectTitle !== null) {
				if (!groups.has(doc.projectId)) {
					groups.set(doc.projectId, { title: doc.projectTitle, docs: [] });
				}
				groups.get(doc.projectId)!.docs.push(doc);
			} else {
				publicOthers.push(doc);
			}
		}

		const result = [...groups.entries()].map(([id, g]) => ({ id, ...g }));
		if (publicOthers.length > 0) {
			result.push({ id: '__public__', title: 'Public documents from other users', docs: publicOthers });
		}
		return result;
	});

	$effect(() => { loadContextLinks(); });

	// ── Searchable toggle ────────────────────────────────────────────────────
	let isSearchable = $state((data.project as typeof data.project & { isSearchable?: boolean }).isSearchable ?? false);
	let togglingSearchable = $state(false);

	async function toggleSearchable() {
		togglingSearchable = true;
		try {
			const result = await trpc.projects.setSearchable.mutate({ id: data.project.id, isSearchable: !isSearchable });
			isSearchable = result.isSearchable;
		} finally {
			togglingSearchable = false;
		}
	}

	// ── Interesados ──────────────────────────────────────────────────────────
	type InterestedUser = { id: string; userId: string; name: string; displayName: string | null; institution: string | null; orcid: string | null; bio: string | null; createdAt: Date };
	let interestedUsers = $state<InterestedUser[]>([]);
	let loadedInterested = $state(false);
	let loadingInterested = $state(false);

	async function loadInterested() {
		if (loadedInterested) return;
		loadingInterested = true;
		try {
			interestedUsers = await trpc.projects.listInterested.query(data.project.id) as InterestedUser[];
			loadedInterested = true;
		} finally {
			loadingInterested = false;
		}
	}

	const statusLabel: Record<string, string> = {
		draft: 'Draft',
		active: 'Active',
		review: 'Under review',
		published: 'Published',
		archived: 'Archived'
	};

	const roleLabel: Record<string, string> = {
		owner: 'Owner',
		author: 'Author',
		coauthor: 'Co-author',
		reviewer: 'Reviewer',
		commenter: 'Commenter'
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
			Projects
		</button>

		<div class="flex items-start justify-between gap-4">
			<div class="min-w-0 flex-1">
				<!-- Title -->
				{#if editingField === 'title'}
					<input
						{@attach focusEl}
						type="text"
						bind:value={editBuffer}
						onblur={() => saveField('title')}
						onkeydown={(e) => {
							if (e.key === 'Enter') { e.currentTarget.blur(); }
							if (e.key === 'Escape') { cancelEdit(); }
						}}
						class="w-full rounded-md border border-accent/40 bg-transparent px-2 py-1 font-serif text-3xl font-semibold text-ink focus:outline-none dark:text-dark-ink"
					/>
				{:else}
					<button
						type="button"
						onclick={() => startEdit('title')}
						disabled={!data.isOwner}
						class="block text-left font-serif text-3xl font-semibold text-ink dark:text-dark-ink {data.isOwner ? 'cursor-text hover:opacity-80' : 'cursor-default'}"
					>
						{data.project.title}
					</button>
				{/if}

				<!-- Description -->
				{#if editingField === 'description'}
					<textarea
						{@attach focusEl}
						bind:value={editBuffer}
						onblur={() => saveField('description')}
						onkeydown={(e) => { if (e.key === 'Escape') { cancelEdit(); } }}
						rows={3}
						placeholder="Add a description…"
						class="mt-2 w-full resize-none rounded-md border border-accent/40 bg-transparent px-2 py-1 font-sans text-sm leading-relaxed text-ink-muted focus:outline-none dark:text-dark-ink-muted"
					></textarea>
				{:else if data.project.description || data.isOwner}
					<button
						type="button"
						onclick={() => startEdit('description')}
						disabled={!data.isOwner}
						class="mt-2 block w-full text-left font-sans text-sm leading-relaxed {data.isOwner ? 'cursor-text hover:opacity-80' : 'cursor-default'} {!data.project.description ? 'italic text-ink-faint dark:text-dark-ink-faint' : 'text-ink-muted dark:text-dark-ink-muted'}"
					>
						{data.project.description || 'Add a description…'}
					</button>
				{/if}

				<!-- Notes -->
				{#if editingField === 'notes'}
					<textarea
						{@attach focusEl}
						bind:value={editBuffer}
						onblur={() => saveField('notes')}
						onkeydown={(e) => { if (e.key === 'Escape') { cancelEdit(); } }}
						rows={4}
						placeholder="Private project notes…"
						class="mt-3 w-full resize-none rounded-md border border-accent/40 bg-transparent px-2 py-1 font-sans text-sm leading-relaxed text-ink focus:outline-none dark:text-dark-ink"
					></textarea>
				{:else}
					{@const notes = (data.project as typeof data.project & { notes?: string | null }).notes}
					{#if notes || data.isOwner}
						<div class="mt-3">
							<span class="font-sans text-[11px] font-semibold uppercase tracking-wide text-ink-faint dark:text-dark-ink-faint">Notes</span>
							<button
								type="button"
								onclick={() => startEdit('notes')}
								disabled={!data.isOwner}
								class="mt-0.5 block w-full text-left font-sans text-sm leading-relaxed {data.isOwner ? 'cursor-text hover:opacity-80' : 'cursor-default'} {!notes ? 'italic text-ink-faint dark:text-dark-ink-faint' : 'text-ink dark:text-dark-ink'}"
							>
								{notes || 'Add notes…'}
							</button>
						</div>
					{/if}
				{/if}
			</div>
			<div class="hidden shrink-0 items-center gap-2 sm:flex">
				<a
					href="/api/projects/{data.project.id}/export"
					download
					title="Export project as YAML"
					class="flex items-center gap-1.5 rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
						<polyline points="7 10 12 15 17 10"/>
						<line x1="12" y1="15" x2="12" y2="3"/>
					</svg>
					Export
				</a>
				<span
					class="rounded-full bg-paper-border px-3 py-1 font-sans text-xs font-medium text-ink-muted dark:bg-dark-paper-border dark:text-dark-ink-muted"
				>
					{statusLabel[data.project.status] ?? data.project.status}
				</span>
			</div>
		</div>

		{#if data.myRole}
			<p class="mt-2 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
				Your role: <span class="font-medium text-accent">{roleLabel[data.myRole] ?? data.myRole}</span>
				· {data.collaborators.length}
				{data.collaborators.length === 1 ? 'collaborator' : 'collaborators'}
			</p>
		{/if}
	</div>

	<div class="grid gap-8 lg:grid-cols-3">
		<!-- Documents section -->
		<div class="lg:col-span-2">
			<div class="mb-4 flex items-center justify-between">
				<h2 class="font-serif text-xl font-semibold text-ink dark:text-dark-ink">Documents</h2>
				<div class="hidden items-center gap-2 sm:flex">
					<a
						href="/projects/{data.project.id}/bib"
						class="flex items-center gap-1.5 rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path d="M4 19.5A2.5 2.5 0 016.5 17H20" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
							<path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						Bibliography
					</a>
					<a
						href="/projects/{data.project.id}/ai"
						class="flex items-center gap-1.5 rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						Assistant
					</a>
					<a
						href="/projects/{data.project.id}/requirements"
						class="flex items-center gap-1.5 rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path d="M9 11l3 3L22 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
							<path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						Requirements
						<RequirementsProgress
							fulfilled={data.requirementCounts.fulfilled}
							total={data.requirementCounts.total}
							requiredFulfilled={data.requirementCounts.requiredFulfilled}
							requiredTotal={data.requirementCounts.requiredTotal}
						/>
					</a>
				{#if canEdit}
					<button
						onclick={() => (showGenerateDraft = true)}
						class="flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/5 px-3 py-1.5 font-sans text-sm text-accent transition-colors hover:bg-accent/10 dark:border-accent/30 dark:bg-accent/10 dark:hover:bg-accent/20"
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						Generate draft
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
						Photos
					</a>
					<a
						href="/projects/{data.project.id}/bib"
						class="flex items-center gap-1.5 rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path d="M4 19.5A2.5 2.5 0 016.5 17H20" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
							<path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
						</svg>
						Bibliography
					</a>
					<button
						onclick={() => (showCreateDoc = !showCreateDoc)}
						class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
					>
						+ New
					</button>
				{/if}
				</div>
			</div>

			<!-- Create document form -->
			{#if showCreateDoc}
				<div class="mb-4 rounded-xl border border-accent/30 bg-paper p-5 dark:bg-dark-paper">
					<div class="flex flex-col gap-3">
						<input
							type="text"
							bind:value={newDocTitle}
							placeholder="Document title"
							class="w-full rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
						/>
						<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
							{#each docTypeOptions as opt (opt.value)}
								<button
									type="button"
									onclick={() => (newDocType = opt.value)}
									class="flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors {newDocType === opt.value ? 'border-accent bg-accent/5 dark:bg-accent/10' : 'border-paper-border hover:bg-paper-ui dark:border-dark-paper-border dark:hover:bg-dark-paper-ui'}"
								>
									<span class="font-sans text-sm font-medium {newDocType === opt.value ? 'text-accent' : 'text-ink dark:text-dark-ink'}">{opt.label}</span>
									<span class="font-sans text-xs leading-tight text-ink-faint dark:text-dark-ink-faint">{opt.description}</span>
								</button>
							{/each}
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
								{creatingDoc ? 'Creating...' : 'Create and open'}
							</button>
							<button
								onclick={() => (showCreateDoc = false)}
								class="rounded-md border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted"
							>
								Cancel
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
						No documents yet. Create the first one.
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
		<div class="mt-8 hidden sm:block">
			<div class="mb-3 flex items-center justify-between">
				<h2 class="font-serif text-lg font-semibold text-ink dark:text-dark-ink">Datasets</h2>
			</div>

			{#if datasets.length === 0}
				<p class="font-sans text-sm text-ink-faint dark:text-dark-ink-faint">
					No datasets. Manage datasets from the <a href="/projects/{data.project.id}/analyses" class="underline hover:text-ink dark:hover:text-dark-ink">analyses</a> section.
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
								Delete
							</button>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Notebooks -->
		<div class="mt-8 hidden sm:block">
			<div class="mb-3 flex items-center justify-between">
				<h2 class="font-serif text-lg font-semibold text-ink dark:text-dark-ink">Notebooks</h2>
				<div class="relative">
					<button
						onclick={() => notebookDropdownOpen = !notebookDropdownOpen}
						disabled={uploadingNotebook}
						class="flex items-center gap-1 rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui disabled:pointer-events-none disabled:opacity-50"
					>
						{uploadingNotebook ? 'Importing…' : '+ Import notebook'}
						<svg class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" /></svg>
					</button>

					{#if notebookDropdownOpen}
						<div
							class="absolute right-0 top-full z-10 mt-1 w-52 rounded-lg border border-paper-border bg-paper shadow-md dark:border-dark-paper-border dark:bg-dark-paper"
							onmouseleave={() => notebookDropdownOpen = false}
						>
							<label class="flex cursor-pointer items-center gap-2.5 rounded-t-lg px-4 py-2.5 font-sans text-sm text-ink transition-colors hover:bg-paper-ui dark:text-dark-ink dark:hover:bg-dark-paper-ui">
								<svg class="h-4 w-4 shrink-0 text-ink-muted dark:text-dark-ink-muted" viewBox="0 0 20 20" fill="currentColor"><path d="M9.25 13.25a.75.75 0 0 0 1.5 0V4.636l2.955 3.129a.75.75 0 0 0 1.09-1.03l-4.25-4.5a.75.75 0 0 0-1.09 0l-4.25 4.5a.75.75 0 1 0 1.09 1.03L9.25 4.636v8.614Z"/><path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z"/></svg>
								From local file
								<input type="file" class="hidden" accept=".ipynb" onchange={uploadNotebook} />
							</label>
							<button
								onclick={() => { notebookDropdownOpen = false; showJupyterModal = true; }}
								class="flex w-full items-center gap-2.5 rounded-b-lg px-4 py-2.5 font-sans text-sm text-ink transition-colors hover:bg-paper-ui dark:text-dark-ink dark:hover:bg-dark-paper-ui"
							>
								<svg class="h-4 w-4 shrink-0 text-ink-muted dark:text-dark-ink-muted" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M13.887 3.182c.396.037.79.08 1.183.128C16.194 3.45 17 4.414 17 5.517V16.75A2.25 2.25 0 0 1 14.75 19h-9.5A2.25 2.25 0 0 1 3 16.75V5.517c0-1.103.806-2.068 1.93-2.207.393-.048.787-.09 1.183-.128A3.001 3.001 0 0 1 9 1h2c1.373 0 2.531.923 2.887 2.182ZM7.5 4A1.5 1.5 0 0 1 9 2.5h2A1.5 1.5 0 0 1 12.5 4v.5h-5V4Z" clip-rule="evenodd"/></svg>
								From remote Jupyter
							</button>
						</div>
					{/if}
				</div>
			</div>

			{#if notebookError}
				<p class="mb-2 font-sans text-sm text-red-600 dark:text-red-400">{notebookError}</p>
			{/if}

			{#if notebooks.length === 0}
				<p class="font-sans text-sm text-ink-faint dark:text-dark-ink-faint">
					No notebooks. Import a <code class="rounded bg-paper-ui px-1 font-mono text-xs dark:bg-dark-paper-ui">.ipynb</code> file to use it as context for the agent.
				</p>
			{:else}
				<div class="flex flex-col gap-1 rounded-xl border border-paper-border bg-paper p-2 dark:border-dark-paper-border dark:bg-dark-paper">
					{#each notebooks as notebook (notebook.id)}
						<div class="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-paper-ui dark:hover:bg-dark-paper-ui">
							<div class="min-w-0">
								<p class="truncate font-sans text-sm font-medium text-ink dark:text-dark-ink">{notebook.filename}</p>
								<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
									{formatSize(notebook.size)}{notebook.languageName ? ` · ${notebook.languageName}` : ''}
								</p>
							</div>
							<button
								onclick={() => deleteNotebook(notebook.id)}
								class="ml-3 shrink-0 font-sans text-xs text-ink-faint transition-colors hover:text-red-600 dark:text-dark-ink-faint dark:hover:text-red-400"
							>
								Delete
							</button>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Sidebar -->
		<div class="hidden flex-col gap-6 sm:flex">
			{#if data.isOwner}
				<InviteCollaborator
					projectId={data.project.id}
					{invitations}
					collaborators={data.collaborators as { id: string; userId: string; role: 'author' | 'coauthor' | 'reviewer' | 'commenter'; name: string; email: string }[]}
					oninvited={reloadInvitations}
					onremove={(c) => { collaboratorToRemove = c; showRemoveCollaborator = true; }}
				/>
			{:else}
				<div
					class="rounded-xl border border-paper-border bg-paper p-5 dark:border-dark-paper-border dark:bg-dark-paper"
				>
					<h3 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">
						Collaborators
					</h3>
					<p class="mt-2 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
						{data.collaborators.length}
						{data.collaborators.length === 1 ? 'collaborator' : 'collaborators'}
					</p>
					<button
						onclick={() => (showLeaveProject = true)}
						class="mt-4 w-full rounded-lg border border-red-200 px-3 py-2 font-sans text-xs text-red-500 transition-colors hover:border-red-300 hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-900/10"
					>
						Leave project…
					</button>
				</div>
			{/if}

			<!-- Publication metadata -->
			{#if data.isOwner || (data.project as typeof data.project & { doi?: string | null; version?: string | null; publishedAt?: Date | null }).doi || (data.project as typeof data.project & { doi?: string | null; version?: string | null; publishedAt?: Date | null }).version || (data.project as typeof data.project & { doi?: string | null; version?: string | null; publishedAt?: Date | null }).publishedAt}
				{@const pub = data.project as typeof data.project & { doi?: string | null; version?: string | null; publishedAt?: Date | null }}
				<div class="rounded-xl border border-paper-border bg-paper p-5 dark:border-dark-paper-border dark:bg-dark-paper">
					<h3 class="mb-3 font-serif text-base font-semibold text-ink dark:text-dark-ink">Publication</h3>
					<div class="flex flex-col gap-2">
						<!-- DOI -->
						<div>
							<span class="font-sans text-[11px] font-semibold uppercase tracking-wide text-ink-faint dark:text-dark-ink-faint">DOI</span>
							{#if editingField === 'doi'}
								<input
									{@attach focusEl}
									type="text"
									bind:value={editBuffer}
									onblur={() => saveField('doi')}
									onkeydown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') cancelEdit(); }}
									placeholder="10.1000/xyz123"
									class="mt-0.5 w-full rounded border border-accent/40 bg-transparent px-2 py-1 font-mono text-xs text-ink focus:outline-none dark:text-dark-ink"
								/>
							{:else}
								<button
									type="button"
									onclick={() => startEdit('doi')}
									disabled={!data.isOwner}
									class="mt-0.5 block w-full text-left font-mono text-xs {data.isOwner ? 'cursor-text hover:opacity-70' : 'cursor-default'} {!pub.doi ? 'italic text-ink-faint dark:text-dark-ink-faint' : 'text-ink dark:text-dark-ink'}"
								>
									{pub.doi || (data.isOwner ? 'Add DOI…' : '—')}
								</button>
							{/if}
						</div>
						<!-- Version -->
						<div>
							<span class="font-sans text-[11px] font-semibold uppercase tracking-wide text-ink-faint dark:text-dark-ink-faint">Version</span>
							{#if editingField === 'version'}
								<input
									{@attach focusEl}
									type="text"
									bind:value={editBuffer}
									onblur={() => saveField('version')}
									onkeydown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') cancelEdit(); }}
									placeholder="1.0.0"
									class="mt-0.5 w-full rounded border border-accent/40 bg-transparent px-2 py-1 font-sans text-xs text-ink focus:outline-none dark:text-dark-ink"
								/>
							{:else}
								<button
									type="button"
									onclick={() => startEdit('version')}
									disabled={!data.isOwner}
									class="mt-0.5 block w-full text-left font-sans text-xs {data.isOwner ? 'cursor-text hover:opacity-70' : 'cursor-default'} {!pub.version ? 'italic text-ink-faint dark:text-dark-ink-faint' : 'text-ink dark:text-dark-ink'}"
								>
									{pub.version || (data.isOwner ? 'Add version…' : '—')}
								</button>
							{/if}
						</div>
						<!-- Published date -->
						<div>
							<span class="font-sans text-[11px] font-semibold uppercase tracking-wide text-ink-faint dark:text-dark-ink-faint">Publication date</span>
							{#if editingField === 'publishedAt'}
								<input
									{@attach focusEl}
									type="date"
									bind:value={editBuffer}
									onblur={() => saveField('publishedAt')}
									onkeydown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') cancelEdit(); }}
									class="mt-0.5 w-full rounded border border-accent/40 bg-transparent px-2 py-1 font-sans text-xs text-ink focus:outline-none dark:text-dark-ink"
								/>
							{:else}
								<button
									type="button"
									onclick={() => startEdit('publishedAt')}
									disabled={!data.isOwner}
									class="mt-0.5 block w-full text-left font-sans text-xs {data.isOwner ? 'cursor-text hover:opacity-70' : 'cursor-default'} {!pub.publishedAt ? 'italic text-ink-faint dark:text-dark-ink-faint' : 'text-ink dark:text-dark-ink'}"
								>
									{pub.publishedAt ? pub.publishedAt.toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric' }) : (data.isOwner ? 'Add date…' : '—')}
								</button>
							{/if}
						</div>
					</div>
				</div>
			{/if}

		<!-- Context links for AI -->
			<div class="rounded-xl border border-paper-border bg-paper p-5 dark:border-dark-paper-border dark:bg-dark-paper">
				<div class="mb-3 flex items-center justify-between gap-2">
					<div>
						<h3 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">External context</h3>
						<p class="mt-0.5 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">Documents from other projects visible to the AI</p>
					</div>
					<button
						onclick={openContextPicker}
						class="shrink-0 rounded-md border border-paper-border px-2.5 py-1 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
					>
						+ Add
					</button>
				</div>

				{#if contextLinks.length === 0}
					<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
						No external documents. Add notes from other projects for the AI to use as context.
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
									title="Remove"
								>
									✕
								</button>
							</div>
						{/each}
					</div>
				{/if}
			</div>
			<!-- Visibilidad pública — owner only -->
			{#if data.isOwner}
				<div class="rounded-xl border border-paper-border bg-paper p-5 dark:border-dark-paper-border dark:bg-dark-paper">
					<div class="flex items-center justify-between gap-3">
						<div>
							<h3 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">Public search</h3>
							<p class="mt-0.5 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
								{isSearchable ? 'Visible in Explore. Shows title, description and Abstract.' : 'Visible to collaborators only.'}
							</p>
						</div>
						<button
							onclick={toggleSearchable}
							disabled={togglingSearchable}
							aria-pressed={isSearchable}
							class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50
								{isSearchable ? 'bg-accent' : 'bg-paper-border dark:bg-dark-paper-border'}"
						>
							<span class="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform
								{isSearchable ? 'translate-x-6' : 'translate-x-1'}"></span>
						</button>
					</div>

					{#if isSearchable}
						<!-- Interesados -->
						<div class="mt-4 border-t border-paper-border pt-4 dark:border-dark-paper-border">
							<div class="mb-2 flex items-center justify-between">
								<h4 class="font-sans text-xs font-semibold uppercase tracking-wide text-ink-faint dark:text-dark-ink-faint">
									Interested
								</h4>
								{#if !loadedInterested}
									<button
										onclick={loadInterested}
										disabled={loadingInterested}
										class="font-sans text-xs text-accent hover:underline disabled:opacity-50"
									>
										{loadingInterested ? 'Loading…' : 'Load'}
									</button>
								{/if}
							</div>
							{#if loadedInterested}
								{#if interestedUsers.length === 0}
									<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
										No one has expressed interest yet.
									</p>
								{:else}
									<ul class="flex flex-col gap-2">
										{#each interestedUsers as u (u.id)}
											<li>
												<a
													href="/u/{u.userId}"
													class="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-paper-ui dark:hover:bg-dark-paper-ui"
												>
													<span class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/20 font-sans text-xs font-semibold text-accent">
														{(u.displayName ?? u.name).charAt(0).toUpperCase()}
													</span>
													<div class="min-w-0">
														<p class="truncate font-sans text-xs font-medium text-ink dark:text-dark-ink">
															{u.displayName ?? u.name}
														</p>
														{#if u.institution}
															<p class="truncate font-sans text-[11px] text-ink-faint dark:text-dark-ink-faint">
																{u.institution}
															</p>
														{/if}
													</div>
												</a>
											</li>
										{/each}
									</ul>
								{/if}
							{/if}
						</div>
					{/if}
				</div>
			{/if}

		<!-- Danger zone — owner only -->
			{#if data.isOwner}
				<div class="mt-2">
					<button
						type="button"
						onclick={() => (showDeleteProject = true)}
						class="w-full rounded-lg border border-red-200 px-3 py-2 font-sans text-xs text-red-500 transition-colors hover:border-red-300 hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-900/10"
					>
						Delete project…
					</button>
				</div>
			{/if}
		</div>
	</div>
</div>

<SafeDeleteDialog
	open={showDeleteProject}
	label="the project"
	warning="All documents, versions, comments and associated data will be permanently deleted."
	deleting={deletingProject}
	onconfirm={handleDeleteProject}
	oncancel={() => (showDeleteProject = false)}
/>

<SafeDeleteDialog
	open={showLeaveProject}
	label="this project"
	title="Leave this project"
	confirmLabel="Leave"
	warning="You will lose access to the project and its documents. The owner can invite you back."
	deleting={leavingProject}
	onconfirm={handleLeaveProject}
	oncancel={() => (showLeaveProject = false)}
/>

<SafeDeleteDialog
	open={showRemoveCollaborator}
	label={collaboratorToRemove?.name ?? 'this collaborator'}
	title="Remove {collaboratorToRemove?.name ?? 'this collaborator'}"
	confirmLabel="Remove"
	warning="They will immediately lose access to the project. You can invite them again."
	deleting={removingCollaborator}
	onconfirm={handleRemoveCollaborator}
	oncancel={() => { showRemoveCollaborator = false; collaboratorToRemove = null; }}
/>

{#if showJupyterModal}
	<JupyterImportModal
		projectId={data.project.id}
		onimported={loadNotebooks}
		onclose={() => { showJupyterModal = false; }}
	/>
{/if}

{#if showContextPicker}
	<!-- Context doc picker modal -->
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
		<div class="flex w-full max-w-md flex-col rounded-2xl border border-paper-border bg-paper shadow-2xl dark:border-dark-paper-border dark:bg-dark-paper" style="max-height: 80vh">
			<div class="flex items-center justify-between border-b border-paper-border px-5 py-4 dark:border-dark-paper-border">
				<h2 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">Add external context</h2>
				<button
					onclick={() => { showContextPicker = false; contextPickerSearch = ''; }}
					class="rounded-md p-1 text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
					aria-label="Close"
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
					placeholder="Search documents or projects…"
					class="w-full rounded-lg border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
				/>
			</div>

			<div class="flex-1 overflow-y-auto px-5 py-3">
				{#if loadingAvailable}
					<p class="py-4 text-center font-sans text-sm text-ink-faint dark:text-dark-ink-faint">Loading…</p>
				{:else if availableByProject().length === 0}
					<p class="py-4 text-center font-sans text-sm text-ink-faint dark:text-dark-ink-faint">
						{availableDocs.length === 0 ? 'No tienes documentos en otros proyectos' : 'Todos los documentos ya están añadidos'}
					</p>
				{:else}
					{#each availableByProject() as group (group.id)}
						<div class="mb-3">
							<p class="mb-1 font-sans text-[11px] font-semibold uppercase tracking-wide text-ink-faint dark:text-dark-ink-faint">{group.title}</p>
							{#each group.docs as doc (doc.id)}
								<div class="flex items-center gap-1 rounded-lg px-1 transition-colors hover:bg-paper-ui dark:hover:bg-dark-paper-ui">
									<button
										onclick={async () => { await addContextLink(doc.id); }}
										class="flex min-w-0 flex-1 items-center gap-2 py-2 pl-2 text-left"
									>
										<span class="min-w-0 flex-1 truncate font-sans text-sm text-ink dark:text-dark-ink">{doc.title}</span>
										{#if doc.isPublic && doc.projectTitle === null}
											<svg width="11" height="11" viewBox="0 0 24 24" fill="none" class="shrink-0 text-green-500" aria-label="Público">
												<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/>
												<path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
											</svg>
										{/if}
										<span class="shrink-0 rounded-full bg-paper-ui px-2 py-0.5 font-sans text-[10px] text-ink-faint dark:bg-dark-paper-ui dark:text-dark-ink-faint">{doc.type}</span>
									</button>
									{#if doc.isPublic && doc.projectTitle === null}
										<button
											onclick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(`[[${doc.title}:${doc.id.slice(0, 8)}]]`); }}
											title="Copiar sintaxis de wikilink"
											class="shrink-0 rounded px-1.5 py-1 font-mono text-[10px] text-ink-faint transition-colors hover:bg-paper-border hover:text-accent dark:text-dark-ink-faint dark:hover:bg-dark-paper-border"
										>[[·]]</button>
									{/if}
								</div>
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
