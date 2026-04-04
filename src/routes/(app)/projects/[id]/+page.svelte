<script lang="ts">
	import { invalidateAll, goto } from '$app/navigation';
	import DocumentItem from '$lib/components/documents/DocumentItem.svelte';
	import InviteCollaborator from '$lib/components/projects/InviteCollaborator.svelte';
	import GenerateDraftModal from '$lib/components/projects/GenerateDraftModal.svelte';
	import RequirementsProgress from '$lib/components/projects/RequirementsProgress.svelte';
	import SafeDeleteDialog from '$lib/components/ui/SafeDeleteDialog.svelte';
	import { trpc } from '$lib/utils/trpc';
	import type { PageData } from './$types';
	import { offlineDb, type PendingCreate } from '$lib/offline.db';
	import { onlineStore } from '$lib/stores/online.svelte';

	let { data }: { data: PageData } = $props();

	type InvitationType = {
		id: string;
		invitedEmail: string;
		role: 'author' | 'coauthor' | 'reviewer' | 'commenter';
		status: string;
		expiresAt: Date;
	};

	const documents = $derived(data.documents);
	const canEdit = $derived(data.isOwner || data.myRole === 'author' || data.myRole === 'coauthor');
	// S3 is available if: personal project with user S3, or org project with org S3
	const hasS3 = $derived(data.projectOrgId ? data.hasOrgS3Config : data.hasUserS3Config);
	const canUploadS3 = $derived(hasS3);
	const s3CtaType = $derived(
		hasS3 ? 'ok' :
		!data.projectOrgId ? 'personal' :
		(data.orgs ?? []).find((o) => o.id === data.projectOrgId)?.role === 'owner' ? 'org-owner' : 'org-member'
	);
	const invitations: InvitationType[] = $derived(
		data.invitations.map((inv) => ({
			...inv,
			role: inv.role as 'author' | 'coauthor' | 'reviewer' | 'commenter'
		}))
	);

	// Check if a chapter UUID is referenced in any book document.
	// Uses bookContent (draft ?? committed version) loaded server-side.
	function isChapterReferenced(chapterId: string): boolean {
		const bookContent = documents
			.filter((d) => d.type === 'book')
			.map((b) => (b as { bookContent?: string }).bookContent ?? '')
			.join('\n');
		return bookContent.includes(`[[doc:${chapterId}`);
	}

	// Get badge text for a document if it's an unassigned chapter
	function getDocumentBadge(doc: { type: string; id: string }): string | null {
		if (doc.type !== 'chapter') return null;
		if (isChapterReferenced(doc.id)) return null;
		return 'Unassigned';
	}

	// ── Click-to-edit ────────────────────────────────────────────────────────
	type EditableField = 'title' | 'description' | 'doi' | 'version' | 'publishedAt';
	let editingField = $state<EditableField | null>(null);
	let editBuffer = $state('');
	let savingField = $state(false);

	function focusEl(node: HTMLElement) {
		node.focus();
	}

	function startEdit(field: EditableField) {
		if (!data.isOwner) return;
		const proj = data.project as typeof data.project & {
			doi?: string | null;
			version?: string | null;
			publishedAt?: Date | null;
		};
		editBuffer =
			field === 'title'
				? proj.title
				: field === 'description'
					? (proj.description ?? '')
					: field === 'doi'
						? (proj.doi ?? '')
						: field === 'version'
							? (proj.version ?? '')
							: field === 'publishedAt'
								? proj.publishedAt
									? proj.publishedAt.toISOString().slice(0, 10)
									: ''
								: '';
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
				...(field === 'doi' ? { doi: editBuffer.trim() || null } : {}),
				...(field === 'version' ? { version: editBuffer.trim() || null } : {}),
				...(field === 'publishedAt'
					? { publishedAt: editBuffer ? new Date(editBuffer) : null }
					: {})
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
	let newDocType:
		| 'paper'
		| 'notes'
		| 'outline'
		| 'bibliography'
		| 'supplementary'
		| 'book'
		| 'chapter' = $state('paper');
	let creatingDoc = $state(false);
	let createDocError = $state('');

	// Split templates, private notes, and normal documents
	const templates = $derived(documents.filter((d) => d.isTemplate));
	const privateDocs = $derived(documents.filter((d) => d.isPrivate && !d.isTemplate));
	const normalDocs = $derived(documents.filter((d) => !d.isTemplate && !d.isPrivate));

	const DOCS_PAGE_SIZE = 20;
	let docFilter = $state('');
	let normalDocsLimit = $state(DOCS_PAGE_SIZE);
	let privateDocsLimit = $state(DOCS_PAGE_SIZE);

	const normalDocsFiltered = $derived(
		docFilter.trim()
			? normalDocs.filter((d) => d.title.toLowerCase().includes(docFilter.toLowerCase()))
			: normalDocs
	);
	const privateDocsFiltered = $derived(
		docFilter.trim()
			? privateDocs.filter((d) => d.title.toLowerCase().includes(docFilter.toLowerCase()))
			: privateDocs
	);
	const normalDocsVisible = $derived(
		docFilter.trim() ? normalDocsFiltered : normalDocsFiltered.slice(0, normalDocsLimit)
	);
	const privateDocsVisible = $derived(
		docFilter.trim() ? privateDocsFiltered : privateDocsFiltered.slice(0, privateDocsLimit)
	);

	const docTypeOptions = [
		{
			value: 'paper' as const,
			label: 'Article / Essay',
			description: 'Main academic text: article, thesis, essay, treatise or commentary.'
		},
		{ value: 'notes' as const, label: 'Notes', description: 'Ideas and annotations in progress.' },
		{
			value: 'outline' as const,
			label: 'Outline',
			description: 'Index or hierarchical argument structure.'
		},
		{
			value: 'bibliography' as const,
			label: 'Bibliography',
			description: 'List of references and sources.'
		},
		{
			value: 'supplementary' as const,
			label: 'Supplementary',
			description: 'Annexes, appendices and supplementary material.'
		},
		{
			value: 'book' as const,
			label: 'Book',
			description: 'Manifest that references chapters. Pre-filled with a starter template.'
		},
		{
			value: 'chapter' as const,
			label: 'Chapter',
			description: 'A book chapter, referenced from a book document.'
		}
	];

	async function createDocument() {
		if (!newDocTitle.trim()) return;
		creatingDoc = true;
		createDocError = '';

		if (!onlineStore.online) {
			await offlineDb.pendingCreates.add({
				id: crypto.randomUUID(),
				projectId: data.project.id,
				title: newDocTitle.trim(),
				type: newDocType,
				isPrivate: false,
				createdAt: new Date(),
				status: 'pending'
			});
			newDocTitle = '';
			creatingDoc = false;
			await loadPendingCreates();
			return;
		}

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

	let creatingPrivateNote = $state(false);
	async function createPrivateNote() {
		creatingPrivateNote = true;
		try {
			const title = `Note ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`;
			const doc = await trpc.documents.create.mutate({
				projectId: data.project.id,
				title,
				type: 'notes',
				isPrivate: true
			});
			window.location.href = `/projects/${data.project.id}/documents/${doc.id}`;
		} catch {
			creatingPrivateNote = false;
		}
	}

	// ── Offline pending creates ───────────────────────────────────────────────

	let pendingCreates = $state<PendingCreate[]>([]);

	async function loadPendingCreates() {
		pendingCreates = await offlineDb.pendingCreates
			.where({ projectId: data.project.id, status: 'pending' })
			.sortBy('createdAt');
	}

	async function syncPendingCreates() {
		const pending = await offlineDb.pendingCreates
			.where({ projectId: data.project.id, status: 'pending' })
			.sortBy('createdAt');
		if (pending.length === 0) return;

		for (const pc of pending) {
			try {
				// Use the locally-generated id so the URL stays consistent
				await trpc.documents.create.mutate({
					projectId: pc.projectId,
					title: pc.title,
					type: pc.type as Parameters<typeof trpc.documents.create.mutate>[0]['type'],
					isPrivate: pc.isPrivate
				});
				await offlineDb.pendingCreates.update(pc.id, { status: 'synced' });
			} catch (e) {
				const msg = e instanceof Error ? e.message : 'Unknown error';
				// Title conflict: append suffix and retry once
				if (msg.includes('título') || msg.includes('CONFLICT')) {
					const fallbackTitle = `${pc.title} (offline)`;
					try {
						await trpc.documents.create.mutate({
							projectId: pc.projectId,
							title: fallbackTitle,
							type: pc.type as Parameters<typeof trpc.documents.create.mutate>[0]['type'],
							isPrivate: pc.isPrivate
						});
						await offlineDb.pendingCreates.update(pc.id, { status: 'synced' });
					} catch {
						await offlineDb.pendingCreates.update(pc.id, { status: 'failed', failureReason: msg });
					}
				} else {
					await offlineDb.pendingCreates.update(pc.id, { status: 'failed', failureReason: msg });
				}
			}
		}
		await loadPendingCreates();
		await invalidateAll();
	}

	$effect(() => {
		loadPendingCreates();
	});

	$effect(() => {
		if (onlineStore.online) syncPendingCreates();
	});

	// ── Templates ─────────────────────────────────────────────────────────────
	let showUseTemplate = $state<string | null>(null); // templateDoc.id being used
	let fromTemplateTitle = $state('');
	let fromTemplateCreating = $state(false);
	let fromTemplateError = $state('');

	let saveAsTemplateDocId = $state<string | null>(null); // doc.id being saved as template
	let templateTitle = $state('');
	let savingTemplate = $state(false);
	let saveTemplateError = $state('');

	function openUseTemplate(templateId: string, templateName: string) {
		showUseTemplate = templateId;
		fromTemplateTitle = templateName.replace(/^Template:\s*/i, '').trim();
		fromTemplateError = '';
	}

	function openSaveAsTemplate(docId: string, docTitle: string) {
		saveAsTemplateDocId = docId;
		templateTitle = `Template: ${docTitle}`;
		saveTemplateError = '';
	}

	async function createFromTemplate() {
		if (!fromTemplateTitle.trim() || !showUseTemplate) return;
		fromTemplateCreating = true;
		fromTemplateError = '';
		try {
			const doc = await trpc.documents.createFromTemplate.mutate({
				templateDocId: showUseTemplate,
				projectId: data.project.id,
				title: fromTemplateTitle.trim()
			});
			window.location.href = `/projects/${data.project.id}/documents/${doc.id}`;
		} catch (e) {
			fromTemplateError = e instanceof Error ? e.message : 'Error creating document';
			fromTemplateCreating = false;
		}
	}

	async function saveAsTemplate() {
		if (!templateTitle.trim() || !saveAsTemplateDocId) return;
		savingTemplate = true;
		saveTemplateError = '';
		try {
			await trpc.documents.saveAsTemplate.mutate({
				documentId: saveAsTemplateDocId,
				templateTitle: templateTitle.trim()
			});
			saveAsTemplateDocId = null;
			await invalidateAll();
		} catch (e) {
			saveTemplateError = e instanceof Error ? e.message : 'Error saving template';
		} finally {
			savingTemplate = false;
		}
	}

	async function reloadInvitations() {
		await invalidateAll();
	}


	// ── Doc kebab menu ───────────────────────────────────────────────────────
	let docMenuOpenId = $state<string | null>(null);

	// ── Delete document (from list) ──────────────────────────────────────────
	let deleteDocTarget = $state<{ id: string; title: string } | null>(null);
	let deletingDocInList = $state(false);

	async function handleDeleteDocFromList() {
		if (!deleteDocTarget) return;
		deletingDocInList = true;
		try {
			await trpc.documents.delete.mutate(deleteDocTarget.id);
			deleteDocTarget = null;
			await invalidateAll();
		} catch {
			deletingDocInList = false;
		}
	}

	// ── Delegate writing (from list) ─────────────────────────────────────────
	let delegateDocTarget = $state<{ id: string; title: string } | null>(null);
	let delegatingInList = $state(false);
	let delegateErrorInList = $state('');

	async function handleSetWriterFromList(docId: string, userId: string | null) {
		delegatingInList = true;
		delegateErrorInList = '';
		try {
			await trpc.documents.setWriter.mutate({ documentId: docId, writerUserId: userId });
			delegateDocTarget = null;
			await invalidateAll();
		} catch (e: unknown) {
			delegateErrorInList = e instanceof Error ? e.message : 'Error updating writer';
		} finally {
			delegatingInList = false;
		}
	}

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
			await goto('/projects', { invalidateAll: true });
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
			await trpc.projects.removeCollaborator.mutate({
				projectId: data.project.id,
				userId: collaboratorToRemove.userId
			});
			await invalidateAll();
			showRemoveCollaborator = false;
			collaboratorToRemove = null;
		} catch (e: unknown) {
			alert(e instanceof Error ? e.message : 'Error removing collaborator');
		} finally {
			removingCollaborator = false;
		}
	}

	function formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

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
		} catch {
			/* non-critical */
		}
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
			(d) => d.title.toLowerCase().includes(q) || (d.projectTitle?.toLowerCase() ?? '').includes(q)
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
			result.push({
				id: '__public__',
				title: 'Public documents from other users',
				docs: publicOthers
			});
		}
		return result;
	});

	$effect(() => {
		loadContextLinks();
	});

	// ── Searchable toggle ────────────────────────────────────────────────────
	let isSearchable = $state(
		(data.project as typeof data.project & { isSearchable?: boolean }).isSearchable ?? false
	);
	let togglingSearchable = $state(false);

	async function toggleSearchable() {
		togglingSearchable = true;
		try {
			const result = await trpc.projects.setSearchable.mutate({
				id: data.project.id,
				isSearchable: !isSearchable
			});
			isSearchable = result.isSearchable;
		} finally {
			togglingSearchable = false;
		}
	}

	// ── Interesados ──────────────────────────────────────────────────────────
	type InterestedUser = {
		id: string;
		userId: string;
		name: string;
		displayName: string | null;
		institution: string | null;
		orcid: string | null;
		bio: string | null;
		createdAt: Date;
	};
	let interestedUsers = $state<InterestedUser[]>([]);
	let loadedInterested = $state(false);
	let loadingInterested = $state(false);

	async function loadInterested() {
		if (loadedInterested) return;
		loadingInterested = true;
		try {
			interestedUsers = (await trpc.projects.listInterested.query(
				data.project.id
			)) as InterestedUser[];
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

<svelte:window onclick={() => { if (docMenuOpenId) docMenuOpenId = null; }} />

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
							if (e.key === 'Enter') {
								e.currentTarget.blur();
							}
							if (e.key === 'Escape') {
								cancelEdit();
							}
						}}
						class="w-full rounded-md border border-accent/40 bg-transparent px-2 py-1 font-serif text-3xl font-semibold text-ink focus:outline-none dark:text-dark-ink"
					/>
				{:else}
					<button
						type="button"
						onclick={() => startEdit('title')}
						disabled={!data.isOwner}
						class="block text-left font-serif text-3xl font-semibold text-ink dark:text-dark-ink {data.isOwner
							? 'cursor-text hover:opacity-80'
							: 'cursor-default'}"
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
						onkeydown={(e) => {
							if (e.key === 'Escape') {
								cancelEdit();
							}
						}}
						rows={3}
						placeholder="Add a description…"
						class="mt-2 w-full resize-none rounded-md border border-accent/40 bg-transparent px-2 py-1 font-sans text-sm leading-relaxed text-ink-muted focus:outline-none dark:text-dark-ink-muted"
					></textarea>
				{:else if data.project.description || data.isOwner}
					<button
						type="button"
						onclick={() => startEdit('description')}
						disabled={!data.isOwner}
						class="mt-2 block w-full text-left font-sans text-sm leading-relaxed {data.isOwner
							? 'cursor-text hover:opacity-80'
							: 'cursor-default'} {!data.project.description
							? 'text-ink-faint italic dark:text-dark-ink-faint'
							: 'text-ink-muted dark:text-dark-ink-muted'}"
					>
						{data.project.description || 'Add a description…'}
					</button>
				{/if}

			</div>
			<div class="hidden shrink-0 items-center gap-2 sm:flex">
				<a
					href="/api/projects/{data.project.id}/export"
					download
					title="Export project as ZIP"
					class="flex items-center gap-1.5 rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
				>
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
						<polyline points="7 10 12 15 17 10" />
						<line x1="12" y1="15" x2="12" y2="3" />
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
				Your role: <span class="font-medium text-accent"
					>{roleLabel[data.myRole] ?? data.myRole}</span
				>
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
					{#if canEdit}
						<button
							onclick={() => (showGenerateDraft = true)}
							class="flex cursor-pointer items-center gap-1.5 rounded-md border border-accent/40 bg-accent/5 px-3 py-1.5 font-sans text-sm text-accent transition-colors hover:bg-accent/10 dark:border-accent/30 dark:bg-accent/10 dark:hover:bg-accent/20"
						>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<path
									d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
							Generate draft
						</button>
						<button
							onclick={() => (showCreateDoc = !showCreateDoc)}
							class="cursor-pointer rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
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
							onkeydown={(e) => {
								if (e.key === 'Enter' && newDocTitle.trim() && !creatingDoc) createDocument();
							}}
						/>
						<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
							{#each docTypeOptions as opt (opt.value)}
								<button
									type="button"
									onclick={() => (newDocType = opt.value)}
									class="flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors {newDocType ===
									opt.value
										? 'border-accent bg-accent/5 dark:bg-accent/10'
										: 'border-paper-border hover:bg-paper-ui dark:border-dark-paper-border dark:hover:bg-dark-paper-ui'}"
								>
									<span
										class="font-sans text-sm font-medium {newDocType === opt.value
											? 'text-accent'
											: 'text-ink dark:text-dark-ink'}">{opt.label}</span
									>
									<span
										class="font-sans text-xs leading-tight text-ink-faint dark:text-dark-ink-faint"
										>{opt.description}</span
									>
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
								title={creatingDoc
									? 'Creating dcoment...'
									: !newDocTitle.trim()
										? 'Must have a title'
										: ''}
								class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
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

			<!-- Semantic search -->
			<form
				method="GET"
				action="/projects/{data.project.id}/search"
				class="mb-3"
			>
				<div class="relative">
					<svg
						width="13"
						height="13"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint dark:text-dark-ink-faint"
						aria-hidden="true"
					>
						<circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
					</svg>
					<input
						type="search"
						name="q"
						placeholder="Search in this project…"
						class="w-full rounded-lg border border-paper-border bg-paper px-3 py-1.5 pl-8 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink dark:placeholder:text-dark-ink-faint"
					/>
				</div>
			</form>

			<!-- Pending offline documents -->
			{#if pendingCreates.length > 0}
				<div class="mb-3 flex flex-col gap-1 rounded-xl border border-amber-200 bg-amber-50 p-2 dark:border-amber-900/40 dark:bg-amber-900/10">
					<p class="px-1 font-sans text-[11px] font-medium text-amber-700 dark:text-amber-400">
						{onlineStore.online ? 'Syncing…' : 'Pending sync when online'}
					</p>
					{#each pendingCreates as pc (pc.id)}
						<div class="flex items-center gap-2 rounded-lg px-2 py-1.5">
							<svg width="12" height="12" viewBox="0 0 24 24" fill="none" class="shrink-0 text-amber-500" aria-hidden="true">
								<path d="M12 2a10 10 0 100 20A10 10 0 0012 2zm0 5v5l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
							</svg>
							<span class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">{pc.title}</span>
						</div>
					{/each}
				</div>
			{/if}

			<!-- Document filter -->
			{#if normalDocs.length > 0 || privateDocs.length > 0}
				<div class="mb-3">
					<input
						type="search"
						bind:value={docFilter}
						placeholder="Filter by title…"
						class="w-full rounded-lg border border-paper-border bg-paper-ui px-3 py-1.5 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink dark:placeholder:text-dark-ink-faint"
					/>
				</div>
			{/if}

			<!-- Document list -->
			{#if normalDocs.length === 0 && templates.length === 0}
				<div
					class="rounded-xl border border-dashed border-paper-border py-12 text-center dark:border-dark-paper-border"
				>
					<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
						No documents yet. Create the first one.
					</p>
				</div>
			{:else if normalDocs.length > 0}
				{#if normalDocsFiltered.length === 0}
					<p class="font-sans text-sm text-ink-faint dark:text-dark-ink-faint">No documents match your filter.</p>
				{:else}
				<div
					class="flex flex-col gap-1 rounded-xl border border-paper-border bg-paper p-2 dark:border-dark-paper-border dark:bg-dark-paper"
				>
					{#each normalDocsVisible as doc (doc.id)}
						<div class="group relative flex items-center">
							<div class="min-w-0 flex-1">
								<DocumentItem
									title={doc.title}
									type={doc.type as
										| 'paper'
										| 'notes'
										| 'outline'
										| 'bibliography'
										| 'supplementary'
										| 'book'
										| 'chapter' | 'reading_note'}
									badge={getDocumentBadge(doc)}
									onclick={() =>
										(window.location.href = `/projects/${data.project.id}/documents/${doc.id}`)}
								/>
							</div>
							{#if canEdit}
								<div class="relative">
									<button
										onclick={(e) => { e.stopPropagation(); docMenuOpenId = docMenuOpenId === doc.id ? null : doc.id; }}
										class="rounded p-1 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink-muted dark:text-dark-ink-faint dark:hover:text-dark-ink-muted"
										aria-label="Document options"
									>
										<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
											<circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
										</svg>
									</button>
									{#if docMenuOpenId === doc.id}
										<div
											class="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-paper-border bg-paper py-1 shadow-lg dark:border-dark-paper-border dark:bg-dark-paper"
											onclick={(e) => e.stopPropagation()}
										>
											{#if data.isOwner && data.collaborators.length > 0}
												<button
													onclick={() => { delegateDocTarget = { id: doc.id, title: doc.title }; docMenuOpenId = null; }}
													class="flex w-full items-center gap-2 px-3 py-2 font-sans text-sm text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
												>
													Delegate writing…
												</button>
											{/if}
											<button
												onclick={() => { openSaveAsTemplate(doc.id, doc.title); docMenuOpenId = null; }}
												class="flex w-full items-center gap-2 px-3 py-2 font-sans text-sm text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
											>
												Save as template
											</button>
											<hr class="my-1 border-paper-border dark:border-dark-paper-border" />
											<button
												onclick={() => { deleteDocTarget = { id: doc.id, title: doc.title }; docMenuOpenId = null; }}
												class="flex w-full items-center gap-2 px-3 py-2 font-sans text-sm text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/10"
											>
												Delete…
											</button>
										</div>
									{/if}
								</div>
							{/if}
						</div>
					{/each}
				</div>
				{#if !docFilter.trim() && normalDocsFiltered.length > normalDocsLimit}
					<button
						onclick={() => (normalDocsLimit += DOCS_PAGE_SIZE)}
						class="mt-1.5 w-full rounded-lg py-1.5 font-sans text-xs text-ink-faint transition-colors hover:text-ink-muted dark:text-dark-ink-faint dark:hover:text-dark-ink-muted"
					>
						Show {Math.min(DOCS_PAGE_SIZE, normalDocsFiltered.length - normalDocsLimit)} more
					</button>
				{/if}
				{/if}
			{/if}

			<!-- My notes (private) -->
			<div class="mt-6">
				<div class="mb-2 flex items-center justify-between">
					<h3
						class="font-sans text-xs font-semibold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint"
					>
						My notes
					</h3>
					<button
						onclick={createPrivateNote}
						disabled={creatingPrivateNote}
						class="font-sans text-xs text-ink-faint transition-colors hover:text-ink disabled:opacity-50 dark:text-dark-ink-faint dark:hover:text-dark-ink"
					>
						+ New private note
					</button>
				</div>
				{#if privateDocs.length > 0}
					{#if privateDocsFiltered.length === 0}
						<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">No notes match your filter.</p>
					{:else}
					<div
						class="flex flex-col gap-1 rounded-xl border border-paper-border bg-paper p-2 dark:border-dark-paper-border dark:bg-dark-paper"
					>
						{#each privateDocsVisible as doc (doc.id)}
							<div class="group relative flex items-center">
								<div class="min-w-0 flex-1">
									<DocumentItem
										title={doc.title}
										type={doc.type as
											| 'paper'
											| 'notes'
											| 'outline'
											| 'bibliography'
											| 'supplementary'
											| 'book'
											| 'chapter' | 'reading_note'}
										onclick={() =>
											(window.location.href = `/projects/${data.project.id}/documents/${doc.id}`)}
									/>
								</div>
								<div class="relative">
									<button
										onclick={(e) => { e.stopPropagation(); docMenuOpenId = docMenuOpenId === doc.id ? null : doc.id; }}
										class="rounded p-1 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink-muted dark:text-dark-ink-faint dark:hover:text-dark-ink-muted"
										aria-label="Note options"
									>
										<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
											<circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
										</svg>
									</button>
									{#if docMenuOpenId === doc.id}
										<div
											class="absolute right-0 top-full z-20 mt-1 w-36 rounded-lg border border-paper-border bg-paper py-1 shadow-lg dark:border-dark-paper-border dark:bg-dark-paper"
											onclick={(e) => e.stopPropagation()}
										>
											<button
												onclick={() => { deleteDocTarget = { id: doc.id, title: doc.title }; docMenuOpenId = null; }}
												class="flex w-full items-center gap-2 px-3 py-2 font-sans text-sm text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/10"
											>
												Delete…
											</button>
										</div>
									{/if}
								</div>
							</div>
						{/each}
					</div>
					{#if !docFilter.trim() && privateDocsFiltered.length > privateDocsLimit}
						<button
							onclick={() => (privateDocsLimit += DOCS_PAGE_SIZE)}
							class="mt-1.5 w-full rounded-lg py-1.5 font-sans text-xs text-ink-faint transition-colors hover:text-ink-muted dark:text-dark-ink-faint dark:hover:text-dark-ink-muted"
						>
							Show {Math.min(DOCS_PAGE_SIZE, privateDocsFiltered.length - privateDocsLimit)} more
						</button>
					{/if}
					{/if}
				{:else}
					<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
						No private notes yet. Only you can see them.
					</p>
				{/if}
			</div>

			<!-- Templates section -->
			{#if templates.length > 0}
				<div class="mt-6">
					<h3
						class="mb-2 font-sans text-xs font-semibold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint"
					>
						Templates
					</h3>
					<div
						class="flex flex-col gap-1 rounded-xl border border-paper-border bg-paper p-2 dark:border-dark-paper-border dark:bg-dark-paper"
					>
						{#each templates as tmpl (tmpl.id)}
							<div class="flex items-center gap-1 py-1.5 pr-1 pl-2">
								<svg
									width="13"
									height="13"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linecap="round"
									stroke-linejoin="round"
									class="shrink-0 text-ink-faint dark:text-dark-ink-faint"
									aria-hidden="true"
								>
									<rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 3v4h8V3" /><path
										d="M8 21v-6h8v6"
									/>
								</svg>
								<span
									class="min-w-0 flex-1 truncate font-sans text-sm text-ink-muted dark:text-dark-ink-muted"
									>{tmpl.title}</span
								>
								<div class="flex shrink-0 items-center gap-1">
									{#if canEdit}
										<button
											onclick={() => openUseTemplate(tmpl.id, tmpl.title)}
											class="rounded-md bg-accent/10 px-2.5 py-1 font-sans text-xs font-medium text-accent hover:bg-accent/20 dark:bg-accent/20 dark:hover:bg-accent/30"
										>
											Use
										</button>
									{/if}
									<a
										href="/projects/{data.project.id}/documents/{tmpl.id}"
										class="rounded-md border border-paper-border px-2.5 py-1 font-sans text-xs text-ink-muted hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
									>
										Edit
									</a>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>

		<!-- Sidebar -->
		<div class="hidden flex-col gap-6 sm:flex">
			<!-- Project navigation -->
			<div
				class="rounded-xl border border-paper-border bg-paper p-4 dark:border-dark-paper-border dark:bg-dark-paper"
			>
				<div class="flex flex-col gap-1">
					<a
						href="/projects/{data.project.id}/ai"
						class="flex items-center gap-2.5 rounded-lg px-3 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui hover:text-ink dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui dark:hover:text-dark-ink"
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"
							><path
								d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
								stroke-linejoin="round"
							/></svg
						>
						Assistant
					</a>
					<a
						href="/projects/{data.project.id}/requirements"
						class="flex items-center gap-2.5 rounded-lg px-3 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui hover:text-ink dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui dark:hover:text-dark-ink"
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"
							><path
								d="M9 11l3 3L22 4"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
								stroke-linejoin="round"
							/><path
								d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
								stroke-linejoin="round"
							/></svg
						>
						Requirements
						<RequirementsProgress
							fulfilled={data.requirementCounts.fulfilled}
							total={data.requirementCounts.total}
							requiredFulfilled={data.requirementCounts.requiredFulfilled}
							requiredTotal={data.requirementCounts.requiredTotal}
						/>
					</a>
					<a
						href="/projects/{data.project.id}/bib"
						class="flex items-center gap-2.5 rounded-lg px-3 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui hover:text-ink dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui dark:hover:text-dark-ink"
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"
							><path
								d="M4 19.5A2.5 2.5 0 016.5 17H20"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
								stroke-linejoin="round"
							/><path
								d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
								stroke-linejoin="round"
							/></svg
						>
						Bibliography
					</a>
					{#if canEdit && canUploadS3}
						<a
							href="/projects/{data.project.id}/photos"
							class="flex items-center gap-2.5 rounded-lg px-3 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui hover:text-ink dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui dark:hover:text-dark-ink"
						>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"
								><rect
									x="3"
									y="3"
									width="18"
									height="18"
									rx="2"
									stroke="currentColor"
									stroke-width="1.5"
								/><circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" stroke-width="1.5" /><path
									d="M21 15l-5-5L5 21"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linecap="round"
									stroke-linejoin="round"
								/></svg
							>
							Photos
						</a>
					<a
						href="/projects/{data.project.id}/notebooks"
						class="flex items-center gap-2.5 rounded-lg px-3 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui hover:text-ink dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui dark:hover:text-dark-ink"
					>
						<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
							<path fill-rule="evenodd" d="M13.887 3.182c.396.037.79.08 1.183.128C16.194 3.45 17 4.414 17 5.517V16.75A2.25 2.25 0 0 1 14.75 19h-9.5A2.25 2.25 0 0 1 3 16.75V5.517c0-1.103.806-2.068 1.93-2.207.393-.048.787-.09 1.183-.128A3.001 3.001 0 0 1 9 1h2c1.373 0 2.531.923 2.887 2.182ZM7.5 4A1.5 1.5 0 0 1 9 2.5h2A1.5 1.5 0 0 1 12.5 4v.5h-5V4Z" clip-rule="evenodd" />
						</svg>
						Notebooks
					</a>
					{:else if canEdit && s3CtaType === 'personal'}
						<a
							href="/settings?tab=storage"
							class="flex items-center gap-2.5 rounded-lg border border-dashed border-paper-border px-3 py-2 font-sans text-sm text-ink-faint transition-colors hover:border-accent/40 hover:text-accent dark:border-dark-paper-border dark:text-dark-ink-faint"
						>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5" />
								<path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
							</svg>
							Configure S3
						</a>
					{:else if canEdit && s3CtaType === 'org-owner'}
						<a
							href="/settings?tab=organizations"
							class="flex items-center gap-2.5 rounded-lg border border-dashed border-paper-border px-3 py-2 font-sans text-sm text-ink-faint transition-colors hover:border-accent/40 hover:text-accent dark:border-dark-paper-border dark:text-dark-ink-faint"
						>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5" />
								<path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
							</svg>
							Configure org S3
						</a>
					{/if}
				</div>
			</div>

			{#if data.isOwner}
				<InviteCollaborator
					projectId={data.project.id}
					{invitations}
					collaborators={data.collaborators as {
						id: string;
						userId: string;
						role: 'author' | 'coauthor' | 'reviewer' | 'commenter';
						name: string;
						email: string;
					}[]}
					oninvited={reloadInvitations}
					onremove={(c) => {
						collaboratorToRemove = c;
						showRemoveCollaborator = true;
					}}
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
				{@const pub = data.project as typeof data.project & {
					doi?: string | null;
					version?: string | null;
					publishedAt?: Date | null;
				}}
				<div
					class="rounded-xl border border-paper-border bg-paper p-5 dark:border-dark-paper-border dark:bg-dark-paper"
				>
					<h3 class="mb-3 font-serif text-base font-semibold text-ink dark:text-dark-ink">
						Publication
					</h3>
					<div class="flex flex-col gap-2">
						<!-- DOI -->
						<div>
							<span
								class="font-sans text-[11px] font-semibold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint"
								>DOI</span
							>
							{#if editingField === 'doi'}
								<input
									{@attach focusEl}
									type="text"
									bind:value={editBuffer}
									onblur={() => saveField('doi')}
									onkeydown={(e) => {
										if (e.key === 'Enter') e.currentTarget.blur();
										if (e.key === 'Escape') cancelEdit();
									}}
									placeholder="10.1000/xyz123"
									class="mt-0.5 w-full rounded border border-accent/40 bg-transparent px-2 py-1 font-mono text-xs text-ink focus:outline-none dark:text-dark-ink"
								/>
							{:else}
								<button
									type="button"
									onclick={() => startEdit('doi')}
									disabled={!data.isOwner}
									class="mt-0.5 block w-full text-left font-mono text-xs {data.isOwner
										? 'cursor-text hover:opacity-70'
										: 'cursor-default'} {!pub.doi
										? 'text-ink-faint italic dark:text-dark-ink-faint'
										: 'text-ink dark:text-dark-ink'}"
								>
									{pub.doi || (data.isOwner ? 'Add DOI…' : '—')}
								</button>
							{/if}
						</div>
						<!-- Version -->
						<div>
							<span
								class="font-sans text-[11px] font-semibold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint"
								>Version</span
							>
							{#if editingField === 'version'}
								<input
									{@attach focusEl}
									type="text"
									bind:value={editBuffer}
									onblur={() => saveField('version')}
									onkeydown={(e) => {
										if (e.key === 'Enter') e.currentTarget.blur();
										if (e.key === 'Escape') cancelEdit();
									}}
									placeholder="1.0.0"
									class="mt-0.5 w-full rounded border border-accent/40 bg-transparent px-2 py-1 font-sans text-xs text-ink focus:outline-none dark:text-dark-ink"
								/>
							{:else}
								<button
									type="button"
									onclick={() => startEdit('version')}
									disabled={!data.isOwner}
									class="mt-0.5 block w-full text-left font-sans text-xs {data.isOwner
										? 'cursor-text hover:opacity-70'
										: 'cursor-default'} {!pub.version
										? 'text-ink-faint italic dark:text-dark-ink-faint'
										: 'text-ink dark:text-dark-ink'}"
								>
									{pub.version || (data.isOwner ? 'Add version…' : '—')}
								</button>
							{/if}
						</div>
						<!-- Published date -->
						<div>
							<span
								class="font-sans text-[11px] font-semibold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint"
								>Publication date</span
							>
							{#if editingField === 'publishedAt'}
								<input
									{@attach focusEl}
									type="date"
									bind:value={editBuffer}
									onblur={() => saveField('publishedAt')}
									onkeydown={(e) => {
										if (e.key === 'Enter') e.currentTarget.blur();
										if (e.key === 'Escape') cancelEdit();
									}}
									class="mt-0.5 w-full rounded border border-accent/40 bg-transparent px-2 py-1 font-sans text-xs text-ink focus:outline-none dark:text-dark-ink"
								/>
							{:else}
								<button
									type="button"
									onclick={() => startEdit('publishedAt')}
									disabled={!data.isOwner}
									class="mt-0.5 block w-full text-left font-sans text-xs {data.isOwner
										? 'cursor-text hover:opacity-70'
										: 'cursor-default'} {!pub.publishedAt
										? 'text-ink-faint italic dark:text-dark-ink-faint'
										: 'text-ink dark:text-dark-ink'}"
								>
									{pub.publishedAt
										? pub.publishedAt.toLocaleDateString('en', {
												year: 'numeric',
												month: 'long',
												day: 'numeric'
											})
										: data.isOwner
											? 'Add date…'
											: '—'}
								</button>
							{/if}
						</div>
					</div>
				</div>
			{/if}

			<!-- Context links for AI -->
			<div
				class="rounded-xl border border-paper-border bg-paper p-5 dark:border-dark-paper-border dark:bg-dark-paper"
			>
				<div class="mb-3 flex items-center justify-between gap-2">
					<div>
						<h3 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">
							External context
						</h3>
						<p class="mt-0.5 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
							Documents from other projects visible to the AI
						</p>
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
							<div
								class="group flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-paper-ui dark:hover:bg-dark-paper-ui"
							>
								<div class="min-w-0 flex-1">
									<p class="truncate font-sans text-xs font-medium text-ink dark:text-dark-ink">
										{link.docTitle}
									</p>
									<p class="truncate font-sans text-[11px] text-ink-faint dark:text-dark-ink-faint">
										{link.sourceProjectTitle}
									</p>
								</div>
								<button
									onclick={() => removeContextLink(link.id)}
									class="mt-0.5 shrink-0 font-sans text-[11px] text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500 dark:text-dark-ink-faint dark:hover:text-red-400"
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
				<div
					class="rounded-xl border border-paper-border bg-paper p-5 dark:border-dark-paper-border dark:bg-dark-paper"
				>
					<div class="flex items-center justify-between gap-3">
						<div>
							<h3 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">
								Public search
							</h3>
							<p class="mt-0.5 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
								{isSearchable
									? 'Visible in Explore. Shows title, description and Abstract.'
									: 'Visible to collaborators only.'}
							</p>
						</div>
						<button
							onclick={toggleSearchable}
							disabled={togglingSearchable}
							aria-pressed={isSearchable}
							aria-label="Toggle public search visibility"
							class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50
								{isSearchable ? 'bg-accent' : 'bg-paper-border dark:bg-dark-paper-border'}"
						>
							<span
								class="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform
								{isSearchable ? 'translate-x-6' : 'translate-x-1'}"
							></span>
						</button>
					</div>

					{#if isSearchable}
						<!-- Interesados -->
						<div class="mt-4 border-t border-paper-border pt-4 dark:border-dark-paper-border">
							<div class="mb-2 flex items-center justify-between">
								<h4
									class="font-sans text-xs font-semibold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint"
								>
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
													<span
														class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/20 font-sans text-xs font-semibold text-accent"
													>
														{(u.displayName ?? u.name).charAt(0).toUpperCase()}
													</span>
													<div class="min-w-0">
														<p
															class="truncate font-sans text-xs font-medium text-ink dark:text-dark-ink"
														>
															{u.displayName ?? u.name}
														</p>
														{#if u.institution}
															<p
																class="truncate font-sans text-[11px] text-ink-faint dark:text-dark-ink-faint"
															>
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
	oncancel={() => {
		showRemoveCollaborator = false;
		collaboratorToRemove = null;
	}}
/>

<!-- Delete document (from list) -->
<SafeDeleteDialog
	open={deleteDocTarget !== null}
	label={deleteDocTarget?.title ?? 'this document'}
	warning="The content, version history and associated comments will be permanently deleted."
	deleting={deletingDocInList}
	onconfirm={handleDeleteDocFromList}
	oncancel={() => (deleteDocTarget = null)}
/>

<!-- Delegate writing (from list) -->
{#if delegateDocTarget}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-4 backdrop-blur-sm dark:bg-dark-ink/30">
		<div class="w-full max-w-sm rounded-2xl border border-paper-border bg-paper p-6 shadow-xl dark:border-dark-paper-border dark:bg-dark-paper">
			<h2 class="font-serif text-lg font-semibold text-ink dark:text-dark-ink">Delegate writing</h2>
			<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				Select a collaborator to give exclusive write access to
				<strong>{delegateDocTarget.title}</strong>. You will lose write access until you reclaim it.
			</p>
			<div class="mt-4 flex flex-col gap-2">
				{#each data.collaborators as collab (collab.userId)}
					<button
						onclick={() => handleSetWriterFromList(delegateDocTarget!.id, collab.userId)}
						disabled={delegatingInList}
						class="flex items-center justify-between rounded-lg border border-paper-border px-4 py-2.5 text-left transition-colors hover:border-accent/40 hover:bg-paper-ui disabled:opacity-50 dark:border-dark-paper-border dark:hover:bg-dark-paper-ui"
					>
						<span class="font-sans text-sm text-ink dark:text-dark-ink">{collab.name ?? collab.userId}</span>
						<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">{collab.role}</span>
					</button>
				{/each}
			</div>
			{#if delegateErrorInList}
				<p class="mt-2 font-sans text-xs text-red-500">{delegateErrorInList}</p>
			{/if}
			<div class="mt-4 flex justify-end">
				<button
					onclick={() => (delegateDocTarget = null)}
					class="rounded-md border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted"
				>
					Cancel
				</button>
			</div>
		</div>
	</div>
{/if}


{#if showContextPicker}
	<!-- Context doc picker modal -->
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
		<div
			class="flex w-full max-w-md flex-col rounded-2xl border border-paper-border bg-paper shadow-2xl dark:border-dark-paper-border dark:bg-dark-paper"
			style="max-height: 80vh"
		>
			<div
				class="flex items-center justify-between border-b border-paper-border px-5 py-4 dark:border-dark-paper-border"
			>
				<h2 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">
					Add external context
				</h2>
				<button
					onclick={() => {
						showContextPicker = false;
						contextPickerSearch = '';
					}}
					class="rounded-md p-1 text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
					aria-label="Close"
				>
					<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
						<path
							d="M1 1l12 12M13 1L1 13"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
						/>
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
					<p class="py-4 text-center font-sans text-sm text-ink-faint dark:text-dark-ink-faint">
						Loading…
					</p>
				{:else if availableByProject().length === 0}
					<p class="py-4 text-center font-sans text-sm text-ink-faint dark:text-dark-ink-faint">
						{availableDocs.length === 0
							? 'No documents in other projects'
							: 'All documents already added'}
					</p>
				{:else}
					{#each availableByProject() as group (group.id)}
						<div class="mb-3">
							<p
								class="mb-1 font-sans text-[11px] font-semibold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint"
							>
								{group.title}
							</p>
							{#each group.docs as doc (doc.id)}
								<div
									class="flex items-center gap-1 rounded-lg px-1 transition-colors hover:bg-paper-ui dark:hover:bg-dark-paper-ui"
								>
									<button
										onclick={async () => {
											await addContextLink(doc.id);
										}}
										class="flex min-w-0 flex-1 items-center gap-2 py-2 pl-2 text-left"
									>
										<span
											class="min-w-0 flex-1 truncate font-sans text-sm text-ink dark:text-dark-ink"
											>{doc.title}</span
										>
										{#if doc.isPublic && doc.projectTitle === null}
											<svg
												width="11"
												height="11"
												viewBox="0 0 24 24"
												fill="none"
												class="shrink-0 text-green-500"
												aria-label="Public"
											>
												<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5" />
												<path
													d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"
													stroke="currentColor"
													stroke-width="1.5"
													stroke-linecap="round"
												/>
											</svg>
										{/if}
										<span
											class="shrink-0 rounded-full bg-paper-ui px-2 py-0.5 font-sans text-[10px] text-ink-faint dark:bg-dark-paper-ui dark:text-dark-ink-faint"
											>{doc.type}</span
										>
									</button>
									{#if doc.isPublic && doc.projectTitle === null}
										<button
											onclick={(e) => {
												e.stopPropagation();
												navigator.clipboard.writeText(`[[${doc.title}:${doc.id.slice(0, 8)}]]`);
											}}
											title="Copy wikilink syntax"
											class="shrink-0 rounded px-1.5 py-1 font-mono text-[10px] text-ink-faint transition-colors hover:bg-paper-border hover:text-accent dark:text-dark-ink-faint dark:hover:bg-dark-paper-border"
											>[[·]]</button
										>
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
		{documents}
		onclose={() => (showGenerateDraft = false)}
		oncreated={(docId) => {
			showGenerateDraft = false;
			window.location.href = `/projects/${data.project.id}/documents/${docId}`;
		}}
	/>
{/if}

<!-- Use template modal -->
{#if showUseTemplate}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
		role="dialog"
		aria-modal="true"
	>
		<div
			class="w-full max-w-sm rounded-2xl border border-paper-border bg-paper p-6 shadow-xl dark:border-dark-paper-border dark:bg-dark-paper"
		>
			<h2 class="mb-4 font-serif text-lg font-semibold text-ink dark:text-dark-ink">
				New document from template
			</h2>
			<div class="flex flex-col gap-3">
				<div>
					<label
						for="from-tmpl-title"
						class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
						>Document title</label
					>
					<input
						id="from-tmpl-title"
						type="text"
						bind:value={fromTemplateTitle}
						placeholder="Document title"
						onkeydown={(e) => {
							if (e.key === 'Enter' && fromTemplateTitle.trim() && !fromTemplateCreating)
								createFromTemplate();
						}}
						class="w-full rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
					/>
				</div>
				{#if fromTemplateError}
					<p class="font-sans text-sm text-red-600 dark:text-red-400">{fromTemplateError}</p>
				{/if}
				<div class="flex gap-2">
					<button
						onclick={createFromTemplate}
						disabled={fromTemplateCreating || !fromTemplateTitle.trim()}
						class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
					>
						{fromTemplateCreating ? 'Creating...' : 'Create and open'}
					</button>
					<button
						onclick={() => (showUseTemplate = null)}
						class="rounded-md border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted"
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Save as template modal -->
{#if saveAsTemplateDocId}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
		role="dialog"
		aria-modal="true"
	>
		<div
			class="w-full max-w-sm rounded-2xl border border-paper-border bg-paper p-6 shadow-xl dark:border-dark-paper-border dark:bg-dark-paper"
		>
			<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">
				Save as template
			</h2>
			<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				A copy of this document will be saved as a reusable template in this project.
			</p>
			<div class="flex flex-col gap-3">
				<div>
					<label
						for="tmpl-title"
						class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
						>Template name</label
					>
					<input
						id="tmpl-title"
						type="text"
						bind:value={templateTitle}
						onkeydown={(e) => {
							if (e.key === 'Enter' && templateTitle.trim() && !savingTemplate) saveAsTemplate();
						}}
						class="w-full rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
					/>
				</div>
				{#if saveTemplateError}
					<p class="font-sans text-sm text-red-600 dark:text-red-400">{saveTemplateError}</p>
				{/if}
				<div class="flex gap-2">
					<button
						onclick={saveAsTemplate}
						disabled={savingTemplate || !templateTitle.trim()}
						class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
					>
						{savingTemplate ? 'Saving...' : 'Save template'}
					</button>
					<button
						onclick={() => (saveAsTemplateDocId = null)}
						class="rounded-md border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted"
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
