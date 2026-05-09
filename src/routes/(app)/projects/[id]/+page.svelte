<script lang="ts">
	import { invalidateAll, goto } from '$app/navigation';
	import { navigating } from '$app/state';
	import { onMount, untrack } from 'svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import DocumentItem from '$lib/components/documents/DocumentItem.svelte';
	import GenerateDraftModal from '$lib/components/projects/GenerateDraftModal.svelte';
	import UrlImportModal from '$lib/components/projects/UrlImportModal.svelte';
	import SafeDeleteDialog from '$lib/components/ui/SafeDeleteDialog.svelte';
	import TextImportModal from '$lib/components/projects/TextImportModal.svelte';
	import ProjectSidebar from '$lib/components/projects/ProjectSidebar.svelte';
	import UseTemplateModal from '$lib/components/projects/UseTemplateModal.svelte';
	import SaveAsTemplateModal from '$lib/components/projects/SaveAsTemplateModal.svelte';
	import TagManager from '$lib/components/projects/TagManager.svelte';
	import TutorialManager from '$lib/components/tutorial/TutorialManager.svelte';
	import { projectTutorialSteps } from '$lib/tutorials/project';
	import { trpc } from '$lib/utils/trpc';
	import type { PageData } from './$types';
	import { offlineDb, type PendingCreate } from '$lib/offline.db';
	import { type DocumentType } from '$lib/domain/document';
	import { onlineStore } from '$lib/stores/online.svelte';
	import { canWriteDocument, type CollaboratorRole } from '$lib/domain/permissions';

	import { resolve } from '$app/paths';
	let { data }: { data: PageData } = $props();

	onMount(() => {
		offlineDb.offlineIndex.put({
			url: `/projects/${data.project.id}`,
			title: data.project.title,
			type: 'project',
			visitedAt: new Date()
		});
	});

	type InvitationType = {
		id: string;
		invitedEmail: string;
		role: 'author' | 'coauthor' | 'reviewer' | 'commenter';
		status: string;
		expiresAt: Date;
	};

	let docSortMode = $state<'date' | 'alpha'>('date');
	let docViewMode = $state<'list' | 'grid'>('list');

	onMount(() => {
		const savedSort = localStorage.getItem('doc-sort') as 'date' | 'alpha' | null;
		const savedView = localStorage.getItem('doc-view') as 'list' | 'grid' | null;
		if (savedSort === 'date' || savedSort === 'alpha') docSortMode = savedSort;
		if (savedView === 'list' || savedView === 'grid') docViewMode = savedView;
	});

	$effect(() => {
		localStorage.setItem('doc-sort', docSortMode);
	});
	$effect(() => {
		localStorage.setItem('doc-view', docViewMode);
	});

	const documents = $derived(
		docSortMode === 'alpha'
			? [...data.documents].sort((a, b) => a.title.localeCompare(b.title))
			: [...data.documents].sort(
					(a, b) => new Date(a.updatedAt ?? 0).getTime() - new Date(b.updatedAt ?? 0).getTime()
				)
	);
	const canEdit = $derived(data.isOwner || data.myRole === 'author' || data.myRole === 'coauthor');
	const activeShareDocSet = $derived(new Set(data.activeShareDocumentIds));

	function isDocReadOnly(doc: { writerUserId: string | null }): boolean {
		return !canWriteDocument({
			isProjectOwner: data.isOwner,
			writerUserId: doc.writerUserId,
			currentUserId: data.currentUserId,
			collaboratorRole: (data.myRole ?? null) as CollaboratorRole | null
		});
	}
	// S3 is available if: personal project with user S3, or org project with org S3
	const hasS3 = $derived(data.projectOrgId ? data.hasOrgS3Config : data.hasUserS3Config);
	const canUploadS3 = $derived(hasS3);
	const s3CtaType = $derived(
		hasS3
			? 'ok'
			: !data.projectOrgId
				? 'personal'
				: (data.orgs ?? []).find((o) => o.id === data.projectOrgId)?.role === 'owner'
					? 'org-owner'
					: 'org-member'
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
	function getDocumentBadge(doc: {
		type: string;
		id: string;
		isReadonly?: boolean;
	}): string | null {
		if (doc.type !== 'chapter') return null;
		if (doc.isReadonly) return null; // imported chapters (EPUB) are standalone by design
		if (isChapterReferenced(doc.id)) return null;
		return 'Unassigned';
	}

	// ── Click-to-edit ────────────────────────────────────────────────────────
	type EditableField = 'title' | 'description';
	let editingField = $state<EditableField | null>(null);
	let editBuffer = $state('');
	let savingField = $state(false);

	function focusEl(node: HTMLElement) {
		node.focus();
	}

	function startEdit(field: EditableField) {
		if (!data.isOwner) return;
		editBuffer = field === 'title' ? data.project.title : (data.project.description ?? '');
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
				...(field === 'description' ? { description: editBuffer.trim() || null } : {})
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

	let showEpubModal = $state(false);
	let showUrlModal = $state(false);

	let newDocTitle = $state('');
	let newDocType = $state<DocumentType>('paper');
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
			await goto(resolve(`/projects/${data.project.id}/documents/${doc.id}`));
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
			await goto(resolve(`/projects/${data.project.id}/documents/${doc.id}`));
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

	let navigatingToDocId = $derived(
		navigating?.to?.url.pathname.match(/\/documents\/([^/]+)$/)?.[1] ?? null
	);

	// ── Templates ─────────────────────────────────────────────────────────────
	let showUseTemplate = $state<string | null>(null);
	let fromTemplateTitle = $state('');
	let saveAsTemplateDocId = $state<string | null>(null);
	let templateTitle = $state('');

	function openUseTemplate(templateId: string, templateName: string) {
		showUseTemplate = templateId;
		fromTemplateTitle = templateName.replace(/^Template:\s*/i, '').trim();
	}

	function openSaveAsTemplate(docId: string, docTitle: string) {
		saveAsTemplateDocId = docId;
		templateTitle = `Template: ${docTitle}`;
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
			// intentionally empty
		} finally {
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

	// ── Starter documents onboarding banner ──────────────────────────────────
	const hasStarterDocs = $derived(documents.some((d) => d.generatedByAi));
	const BANNER_KEY = untrack(() => `scholio:starter-banner-dismissed:${data.project.id}`);
	let starterBannerDismissed = $state(false);

	onMount(() => {
		starterBannerDismissed = !!localStorage.getItem(BANNER_KEY);
	});

	function dismissStarterBanner() {
		localStorage.setItem(BANNER_KEY, '1');
		starterBannerDismissed = true;
	}
</script>

<svelte:window
	onclick={() => {
		if (docMenuOpenId) docMenuOpenId = null;
	}}
/>

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
						translate="no"
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
						data-tutorial="project-title"
						type="button"
						translate="no"
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
						translate={data.project.description ? 'no' : 'yes'}
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
					href={resolve(`/projects/${data.project.id}/ai`)}
					class="flex items-center gap-1.5 rounded-md bg-accent/10 px-3 py-1.5 font-sans text-sm font-medium text-accent transition-colors hover:bg-accent/20 dark:bg-accent/20 dark:hover:bg-accent/30"
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path
							d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					Assistant
				</a>
				{#if data.openComments > 0}
					<a
						href={resolve(`/projects/${data.project.id}/review`)}
						class="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 font-sans text-xs font-medium text-amber-700 transition-colors hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50"
						title="View open comments"
					>
						<svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path
								d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
						{data.openComments}
					</a>
				{/if}
				{#if data.isOwner}
					<button
						onclick={() => {
							showUrlModal = true;
						}}
						title="Import URL"
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
							<circle cx="12" cy="12" r="10" /><path
								d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
							/>
						</svg>
						URL
					</button>
					<button
						onclick={() => {
							showEpubModal = true;
						}}
						title="Import book text"
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
							<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path
								d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"
							/>
						</svg>
						Book
					</button>
				{/if}
				<a
					href={resolve(`/api/projects/${data.project.id}/export`)}
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

	<!-- Tags -->
	{#if data.isOwner}
		<div class="mb-4">
			<TagManager projectId={data.project.id} initialTags={data.projectTags} />
		</div>
	{/if}

	{#if showUrlModal}
		<UrlImportModal
			projectId={data.project.id}
			hasAiKey={data.hasAiKey}
			onclose={() => (showUrlModal = false)}
		/>
	{/if}

	{#if showEpubModal}
		<TextImportModal projectId={data.project.id} onclose={() => (showEpubModal = false)} />
	{/if}

	<div class="grid gap-8 lg:grid-cols-3">
		<!-- Documents section -->
		<div
			data-tutorial="project-docs-section"
			class={docViewMode === 'grid' ? 'lg:col-span-3' : 'lg:col-span-2'}
		>
			<div class="mb-4 flex items-center justify-between">
				<h2 class="font-serif text-xl font-semibold text-ink dark:text-dark-ink">Documents</h2>
				<div class="hidden items-center gap-2 sm:flex">
					<!-- Sort toggle -->
					<div
						class="flex overflow-hidden rounded-md border border-paper-border font-sans text-xs dark:border-dark-paper-border"
					>
						<button
							onclick={() => (docSortMode = 'date')}
							class="px-2.5 py-1 transition-colors {docSortMode === 'date'
								? 'bg-paper-ui text-ink dark:bg-dark-paper-ui dark:text-dark-ink'
								: 'text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink'}"
							>Date</button
						>
						<button
							onclick={() => (docSortMode = 'alpha')}
							class="px-2.5 py-1 transition-colors {docSortMode === 'alpha'
								? 'bg-paper-ui text-ink dark:bg-dark-paper-ui dark:text-dark-ink'
								: 'text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink'}"
							>A–Z</button
						>
					</div>
					<!-- List / Grid view toggle -->
					<div
						class="flex overflow-hidden rounded-md border border-paper-border dark:border-dark-paper-border"
					>
						<button
							onclick={() => (docViewMode = 'list')}
							aria-label="List view"
							class="px-2 py-1 transition-colors {docViewMode === 'list'
								? 'bg-paper-ui text-ink dark:bg-dark-paper-ui dark:text-dark-ink'
								: 'text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink'}"
						>
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.75"
								stroke-linecap="round"
								aria-hidden="true"
							>
								<line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line
									x1="3"
									y1="18"
									x2="21"
									y2="18"
								/>
							</svg>
						</button>
						<button
							onclick={() => (docViewMode = 'grid')}
							aria-label="Grid view"
							class="px-2 py-1 transition-colors {docViewMode === 'grid'
								? 'bg-paper-ui text-ink dark:bg-dark-paper-ui dark:text-dark-ink'
								: 'text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink'}"
						>
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.75"
								stroke-linecap="round"
								aria-hidden="true"
							>
								<rect x="3" y="3" width="7" height="7" rx="1" /><rect
									x="14"
									y="3"
									width="7"
									height="7"
									rx="1"
								/>
								<rect x="3" y="14" width="7" height="7" rx="1" /><rect
									x="14"
									y="14"
									width="7"
									height="7"
									rx="1"
								/>
							</svg>
						</button>
					</div>
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
							data-tutorial="project-new-doc"
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
							<span
								title={creatingDoc
									? 'Creating document…'
									: !newDocTitle.trim()
										? 'Enter a title first'
										: ''}
								class={creatingDoc || !newDocTitle.trim() ? 'cursor-not-allowed' : ''}
							>
								<button
									onclick={createDocument}
									disabled={creatingDoc || !newDocTitle.trim()}
									class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:pointer-events-none disabled:opacity-50"
								>
									{creatingDoc ? 'Creating…' : 'Create and open'}
								</button>
							</span>
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
			<form method="GET" action="/projects/{data.project.id}/search" class="mb-3">
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
				<div
					class="mb-3 flex flex-col gap-1 rounded-xl border border-amber-200 bg-amber-50 p-2 dark:border-amber-900/40 dark:bg-amber-900/10"
				>
					<p class="px-1 font-sans text-[11px] font-medium text-amber-700 dark:text-amber-400">
						{onlineStore.online ? 'Syncing…' : 'Pending sync when online'}
					</p>
					{#each pendingCreates as pc (pc.id)}
						<div class="flex items-center gap-2 rounded-lg px-2 py-1.5">
							<svg
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								class="shrink-0 text-amber-500"
								aria-hidden="true"
							>
								<path
									d="M12 2a10 10 0 100 20A10 10 0 0012 2zm0 5v5l3 3"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linecap="round"
								/>
							</svg>
							<span class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted"
								>{pc.title}</span
							>
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

			<!-- Starter documents banner -->
			{#if hasStarterDocs && !starterBannerDismissed}
				<div
					class="mb-4 flex items-start gap-3 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 dark:border-accent/20 dark:bg-accent/10"
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="mt-0.5 shrink-0 text-accent"
						aria-hidden="true"
					>
						<circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
					</svg>
					<div class="min-w-0 flex-1">
						<p class="font-sans text-sm font-medium text-ink dark:text-dark-ink">
							Sample documents
						</p>
						<p
							class="mt-0.5 font-sans text-xs leading-relaxed text-ink-muted dark:text-dark-ink-muted"
						>
							Two AI-generated example documents have been added to show you features like
							citations, footnotes, and epigraphs. Explore them freely — or delete them whenever you
							like.
						</p>
					</div>
					<button
						onclick={dismissStarterBanner}
						class="shrink-0 rounded p-0.5 text-ink-faint transition-colors hover:text-ink dark:text-dark-ink-faint dark:hover:text-dark-ink"
						aria-label="Dismiss"
					>
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							aria-hidden="true"
						>
							<path d="M18 6 6 18M6 6l12 12" />
						</svg>
					</button>
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
					<p class="font-sans text-sm text-ink-faint dark:text-dark-ink-faint">
						No documents match your filter.
					</p>
				{:else if docViewMode === 'grid'}
					<!-- Grid view: all documents, 4 columns -->
					<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
						{#each normalDocsFiltered as doc (doc.id)}
							<button
								onclick={() => goto(resolve(`/projects/${data.project.id}/documents/${doc.id}`))}
								class="group relative flex flex-col gap-2 rounded-xl border border-paper-border bg-paper p-4 text-left transition-colors hover:border-accent/40 hover:bg-paper-ui dark:border-dark-paper-border dark:bg-dark-paper dark:hover:border-accent/30 dark:hover:bg-dark-paper-ui"
							>
								<!-- Type icon / badge -->
								<div class="flex items-center justify-between">
									<span
										class="font-sans text-[10px] font-medium tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint"
										>{doc.type}</span
									>
									{#if navigatingToDocId === doc.id}
										<Spinner size="sm" />
									{:else if isDocReadOnly(doc)}
										<svg
											width="11"
											height="11"
											viewBox="0 0 24 24"
											fill="none"
											class="text-ink-faint dark:text-dark-ink-faint"
											aria-hidden="true"
										>
											<rect
												x="3"
												y="11"
												width="18"
												height="11"
												rx="2"
												stroke="currentColor"
												stroke-width="1.75"
											/>
											<path
												d="M7 11V7a5 5 0 0 1 10 0v4"
												stroke="currentColor"
												stroke-width="1.75"
												stroke-linecap="round"
											/>
										</svg>
									{/if}
								</div>
								<p
									translate="no"
									class="line-clamp-3 font-serif text-sm leading-snug font-medium text-ink dark:text-dark-ink"
								>
									{doc.title}
								</p>
								{#if doc.updatedAt}
									<p class="mt-auto font-sans text-[10px] text-ink-faint dark:text-dark-ink-faint">
										{new Date(doc.updatedAt).toLocaleDateString()}
									</p>
								{/if}
							</button>
						{/each}
					</div>
				{:else}
					<div
						class="flex flex-col gap-1 rounded-xl border border-paper-border bg-paper p-2 dark:border-dark-paper-border dark:bg-dark-paper"
					>
						{#each normalDocsVisible as doc (doc.id)}
							<div
								class="group relative flex items-center {doc.generatedByAi
									? 'rounded-lg border-2 border-accent/30 dark:border-accent/25'
									: ''}"
							>
								<div class="min-w-0 flex-1">
									<DocumentItem
										title={doc.title}
										type={doc.type as DocumentType}
										badge={doc.generatedByAi ? 'Example · Delete anytime' : getDocumentBadge(doc)}
										onclick={() =>
											goto(resolve(`/projects/${data.project.id}/documents/${doc.id}`))}
									/>
								</div>
								{#if data.isOwner && activeShareDocSet.has(doc.id)}
									<span
										class="mr-1 shrink-0 text-accent"
										title="Has active public links"
										aria-label="Has active public links"
									>
										<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
											<circle cx="2" cy="10" r="1.5" fill="currentColor" />
											<path
												d="M2 7a3 3 0 0 1 3 3"
												stroke="currentColor"
												stroke-width="1.2"
												stroke-linecap="round"
											/>
											<path
												d="M2 3.5A6.5 6.5 0 0 1 8.5 10"
												stroke="currentColor"
												stroke-width="1.2"
												stroke-linecap="round"
											/>
										</svg>
									</span>
								{/if}
								{#if isDocReadOnly(doc)}
									<span
										title="Read-only"
										class="mr-1 shrink-0 text-ink-faint dark:text-dark-ink-faint"
										aria-label="Read-only"
									>
										<svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
											<rect
												x="3"
												y="11"
												width="18"
												height="11"
												rx="2"
												stroke="currentColor"
												stroke-width="1.75"
											/>
											<path
												d="M7 11V7a5 5 0 0 1 10 0v4"
												stroke="currentColor"
												stroke-width="1.75"
												stroke-linecap="round"
											/>
										</svg>
									</span>
								{/if}
								{#if navigatingToDocId === doc.id}
									<span class="mr-1 shrink-0 text-ink-faint dark:text-dark-ink-faint"
										><Spinner size="sm" /></span
									>
								{/if}
								{#if (data.openCommentsByDoc[doc.id] ?? 0) > 0}
									<a
										href={resolve(`/projects/${data.project.id}/review#doc-${doc.id}`)}
										onclick={(e) => e.stopPropagation()}
										class="mr-1 flex shrink-0 items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 font-sans text-xs font-medium text-amber-700 transition-colors hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50"
										title="View open comments"
									>
										<svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden="true">
											<path
												d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
												stroke-linejoin="round"
											/>
										</svg>
										{data.openCommentsByDoc[doc.id]}
									</a>
								{/if}
								{#if canEdit}
									<div class="relative">
										<button
											onclick={(e) => {
												e.stopPropagation();
												docMenuOpenId = docMenuOpenId === doc.id ? null : doc.id;
											}}
											class="rounded p-1 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink-muted dark:text-dark-ink-faint dark:hover:text-dark-ink-muted"
											aria-label="Document options"
										>
											<svg
												width="14"
												height="14"
												viewBox="0 0 24 24"
												fill="currentColor"
												aria-hidden="true"
											>
												<circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle
													cx="12"
													cy="19"
													r="1.5"
												/>
											</svg>
										</button>
										{#if docMenuOpenId === doc.id}
											<!-- svelte-ignore a11y_click_events_have_key_events -->
											<div
												class="absolute top-full right-0 z-20 mt-1 w-44 rounded-lg border border-paper-border bg-paper py-1 shadow-lg dark:border-dark-paper-border dark:bg-dark-paper"
												role="menu"
												tabindex="-1"
												onclick={(e) => e.stopPropagation()}
											>
												{#if doc.type === 'book'}
													<a
														href={resolve(`/projects/${data.project.id}/documents/${doc.id}/read`)}
														onclick={() => (docMenuOpenId = null)}
														class="flex w-full items-center gap-2 px-3 py-2 font-sans text-sm text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
													>
														Read
													</a>
												{/if}
												<a
													href={resolve(`/projects/${data.project.id}/documents/${doc.id}/history`)}
													onclick={() => (docMenuOpenId = null)}
													class="flex w-full items-center gap-2 px-3 py-2 font-sans text-sm text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
												>
													Ver historial
												</a>
												{#if canEdit}
													<a
														href={resolve(
															`/projects/${data.project.id}/documents/${doc.id}?published`
														)}
														onclick={() => (docMenuOpenId = null)}
														class="flex w-full items-center gap-2 px-3 py-2 font-sans text-sm text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
													>
														Ver publicado
													</a>
												{/if}
												{#if data.isOwner && data.collaborators.length > 0}
													<button
														onclick={() => {
															delegateDocTarget = { id: doc.id, title: doc.title };
															docMenuOpenId = null;
														}}
														class="flex w-full items-center gap-2 px-3 py-2 font-sans text-sm text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
													>
														Delegate writing…
													</button>
												{/if}
												<button
													onclick={() => {
														openSaveAsTemplate(doc.id, doc.title);
														docMenuOpenId = null;
													}}
													class="flex w-full items-center gap-2 px-3 py-2 font-sans text-sm text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
												>
													Save as template
												</button>
												<hr class="my-1 border-paper-border dark:border-dark-paper-border" />
												<button
													onclick={() => {
														deleteDocTarget = { id: doc.id, title: doc.title };
														docMenuOpenId = null;
													}}
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
						<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
							No notes match your filter.
						</p>
					{:else}
						<div
							class="flex flex-col gap-1 rounded-xl border border-paper-border bg-paper p-2 dark:border-dark-paper-border dark:bg-dark-paper"
						>
							{#each privateDocsVisible as doc (doc.id)}
								<div class="group relative flex items-center">
									<div class="min-w-0 flex-1">
										<DocumentItem
											title={doc.title}
											type={doc.type as DocumentType}
											onclick={() =>
												goto(resolve(`/projects/${data.project.id}/documents/${doc.id}`))}
										/>
									</div>
									{#if navigatingToDocId === doc.id}
										<span class="mr-1 shrink-0 text-ink-faint dark:text-dark-ink-faint"
											><Spinner size="sm" /></span
										>
									{/if}
									{#if activeShareDocSet.has(doc.id)}
										<span
											class="mr-1 h-2 w-2 shrink-0 rounded-full bg-accent"
											title="Has active public links"
											aria-label="Has active public links"
										></span>
									{/if}
									<div class="relative">
										<button
											onclick={(e) => {
												e.stopPropagation();
												docMenuOpenId = docMenuOpenId === doc.id ? null : doc.id;
											}}
											class="rounded p-1 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink-muted dark:text-dark-ink-faint dark:hover:text-dark-ink-muted"
											aria-label="Note options"
										>
											<svg
												width="14"
												height="14"
												viewBox="0 0 24 24"
												fill="currentColor"
												aria-hidden="true"
											>
												<circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle
													cx="12"
													cy="19"
													r="1.5"
												/>
											</svg>
										</button>
										{#if docMenuOpenId === doc.id}
											<!-- svelte-ignore a11y_click_events_have_key_events -->
											<div
												class="absolute top-full right-0 z-20 mt-1 w-36 rounded-lg border border-paper-border bg-paper py-1 shadow-lg dark:border-dark-paper-border dark:bg-dark-paper"
												role="menu"
												tabindex="-1"
												onclick={(e) => e.stopPropagation()}
											>
												<button
													onclick={() => {
														deleteDocTarget = { id: doc.id, title: doc.title };
														docMenuOpenId = null;
													}}
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
									translate="no"
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
										href={resolve(`/projects/${data.project.id}/documents/${tmpl.id}`)}
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
		<div data-tutorial="project-sidebar">
			<ProjectSidebar
				isOwner={data.isOwner}
				{canEdit}
				{canUploadS3}
				{s3CtaType}
				requirementCounts={data.requirementCounts}
				collaborators={data.collaborators as {
					id: string;
					userId: string;
					role: 'author' | 'coauthor' | 'reviewer' | 'commenter';
					name: string;
					email: string;
				}[]}
				{invitations}
				project={data.project as {
					id: string;
					status: string;
					citationStyle?: string | null;
					doi?: string | null;
					version?: string | null;
					publishedAt?: Date | null;
					isSearchable?: boolean;
				}}
			/>
		</div>
	</div>
</div>

<TutorialManager
	slug="project"
	completedTutorials={data.completedTutorials}
	steps={projectTutorialSteps}
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
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-4 backdrop-blur-sm dark:bg-dark-ink/30"
	>
		<div
			class="w-full max-w-sm rounded-2xl border border-paper-border bg-paper p-6 shadow-xl dark:border-dark-paper-border dark:bg-dark-paper"
		>
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
						<span class="font-sans text-sm text-ink dark:text-dark-ink"
							>{collab.name ?? collab.userId}</span
						>
						<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint"
							>{collab.role}</span
						>
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

{#if showUseTemplate}
	<UseTemplateModal
		templateId={showUseTemplate}
		initialTitle={fromTemplateTitle}
		projectId={data.project.id}
		onclose={() => (showUseTemplate = null)}
	/>
{/if}

{#if saveAsTemplateDocId}
	<SaveAsTemplateModal
		docId={saveAsTemplateDocId}
		initialTitle={templateTitle}
		onclose={() => (saveAsTemplateDocId = null)}
	/>
{/if}
