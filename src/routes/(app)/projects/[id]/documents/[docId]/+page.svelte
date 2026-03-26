<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import MobileNoteEditor from '$lib/components/editor/MobileNoteEditor.svelte';
	import MarkdownEditor from '$lib/components/editor/MarkdownEditor.svelte';
	import MarkdownPreview from '$lib/components/editor/MarkdownPreview.svelte';
	import DiffViewer from '$lib/components/editor/DiffViewer.svelte';
	import CommentThread from '$lib/components/editor/CommentThread.svelte';
	import SafeDeleteDialog from '$lib/components/ui/SafeDeleteDialog.svelte';
	import AiEditorPanel from '$lib/components/ai/AiEditorPanel.svelte';
	import { trpc } from '$lib/utils/trpc';
	import { findAnchor, posToLine, type CommentRange } from '$lib/components/editor/commentsExtension';
	import { CITATION_STYLE_LABELS, type CitationStyle, type CiteRef } from '$lib/utils/citations';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// untrack: read from props once without creating a reactive dependency
	let content = $state(untrack(() => data.document?.content ?? ''));
	let lastSavedContent = $state(untrack(() => data.document?.content ?? ''));
	const isDirty = $derived(content !== lastSavedContent);
	let saveStatus: 'idle' | 'pending' | 'saving' | 'saved' | 'error' = $state(
		untrack(() => (data.document?.hasDraft ? 'pending' : 'idle'))
	);

	let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

	// View mode: editor | split | preview
	type ViewMode = 'editor' | 'split' | 'preview';
	const VIEW_MODE_KEY = `view-mode-${data.document?.id ?? ''}`;
	let viewMode = $state<ViewMode>(
		(typeof localStorage !== 'undefined' ? localStorage.getItem(VIEW_MODE_KEY) as ViewMode | null : null) ?? 'editor'
	);
	function setViewMode(m: ViewMode) {
		viewMode = m;
		localStorage.setItem(VIEW_MODE_KEY, m);
		if (m !== 'editor') loadRefs();
	}

	// Citations
	let citationStyle = $state<CitationStyle>('apa');
	let projectRefs = $state<CiteRef[]>([]);
	let refsLoaded = $state(false);
	let showCitePicker = $state(false);
	let citeSearch = $state('');
	let editorEl: {
		insertAtCursor: (text: string) => void;
		getSelection: () => { text: string; from: number; to: number } | null;
		replaceRange: (from: number, to: number, text: string) => void;
	} | null = $state(null);

	const filteredRefs = $derived(() => {
		const q = citeSearch.toLowerCase();
		if (!q) return projectRefs;
		return projectRefs.filter(
			(r) =>
				r.citeKey.toLowerCase().includes(q) ||
				r.title.toLowerCase().includes(q) ||
				r.authors.some((a) => a.last.toLowerCase().includes(q))
		);
	});

	async function loadRefs() {
		if (refsLoaded) return;
		try {
			const rows = await trpc.references.list.query(data.document.projectId);
			projectRefs = rows as CiteRef[];
			refsLoaded = true;
		} catch {
			/* non-critical */
		}
	}

	function openCitePicker() {
		citeSearch = '';
		showCitePicker = true;
		loadRefs();
	}

	function insertCitation(ref: CiteRef) {
		editorEl?.insertAtCursor(`[@${ref.citeKey}]`);
		showCitePicker = false;
	}

	// Persist citation style per document in localStorage
	$effect(() => {
		if (!data.document) return;
		const stored = localStorage.getItem(`cite-style-${data.document.id}`);
		if (stored && (stored === 'apa' || stored === 'ieee' || stored === 'vancouver' || stored === 'chicago')) {
			citationStyle = stored as CitationStyle;
		}
	});

	function setCitationStyle(s: CitationStyle) {
		citationStyle = s;
		localStorage.setItem(`cite-style-${data.document.id}`, s);
	}

	// Load refs when preview is opened
	$effect(() => {
		if (viewMode !== 'editor') loadRefs();
	});

	// Wikilinks: build title → {id, projectId} map.
	// Same-project docs indexed by title: [[Introducción]]
	// Same-project docs also indexed by UUID: [[doc:uuid|Title]] (book→chapter links)
	// External context docs indexed by "title:hash": [[Introducción:a3f9b2c1]]
	const docMap = $derived(() => {
		const map = new Map<string, { id: string; projectId: string }>();
		for (const d of data.projectDocs) {
			map.set(d.title, { id: d.id, projectId: d.projectId });
			map.set(d.id, { id: d.id, projectId: d.projectId }); // UUID-keyed for [[doc:uuid|...]]
		}
		for (const d of data.externalDocs) {
			const hash = d.id.slice(0, 8);
			map.set(`${d.title}:${hash}`, { id: d.id, projectId: d.projectId });
		}
		return map;
	});

	// Chapters available for [[doc:uuid|Title]] autocomplete (only relevant for book documents)
	const chapters = $derived(
		data.document.type === 'book'
			? data.projectDocs.filter((d) => d.type === 'chapter')
			: []
	);

	// Backlinks from server (updated on commit)
	const backlinks = $derived(data.backlinks);

	// Version history
	let showHistory = $state(false);
	type Version = {
		id: string;
		versionNumber: number;
		changeDescription: string | null;
		createdAt: Date;
	};
	let versions: Version[] = $state([]);
	let loadingVersions = $state(false);
	let selectedVersionId: string | null = $state(null);
	type VersionDiff = {
		current: { id: string; versionNumber: number; content: string };
		previous: { id: string; versionNumber: number; content: string } | null;
	};
	let compareDiff: VersionDiff | null = $state(null);
	let loadingCompare = $state(false);

	// Public toggle
	let isPublic = $state(untrack(() => data.document?.isPublic ?? false));

	async function togglePublic() {
		isPublic = !isPublic;
		try {
			await trpc.documents.update.mutate({ id: data.document.id, isPublic });
		} catch {
			isPublic = !isPublic; // revert on error
		}
	}

	// Markdown cheatsheet
	let showCheatsheet = $state(false);

	// Commit dialog
	let showCommit = $state(false);
	let commitMessage = $state('');

	// ── Delete document ───────────────────────────────────────────────────────
	let showDeleteDoc = $state(false);
	let deletingDoc = $state(false);

	async function handleDeleteDoc() {
		deletingDoc = true;
		try {
			await trpc.documents.delete.mutate(data.document.id);
			await goto(`/projects/${data.document.projectId}`);
		} catch {
			deletingDoc = false;
			showDeleteDoc = false;
		}
	}
	let committing = $state(false);
	let commitError = $state('');

	// Inline comments
	type Reply = { id: string; authorName: string; content: string; createdAt: Date };
	type InlineComment = {
		id: string;
		authorId: string;
		authorName: string;
		content: string;
		anchorText: string | null;
		lineStart: number | null;
		characterStart: number | null;
		characterEnd: number | null;
		status: 'open' | 'resolved';
		createdAt: Date;
		replies: Reply[];
	};

	let showComments = $state(false);
	let inlineComments: InlineComment[] = $state(untrack(() => (data.inlineComments as InlineComment[]) ?? []));

	// Selection → floating "Comentar" button
	type Selection = { text: string; from: number; to: number; coords: { top: number; bottom: number; left: number; right: number } | null };
	let currentSelection: Selection | null = $state(null);

	// New comment form (triggered from floating button)
	let showNewComment = $state(false);
	let newCommentText = $state('');
	let submittingComment = $state(false);

	// Scroll target for editor
	let scrollToRange: { from: number; to: number } | null = $state(null);

	// Compute comment ranges for editor decorations (open comments only)
	const commentRanges = $derived.by<CommentRange[]>(() => {
		const ranges: CommentRange[] = [];
		for (const c of inlineComments) {
			if (c.status === 'resolved') continue;
			const anchor = findAnchor(content, c.anchorText ?? '', c.characterStart ?? 0);
			if (anchor) ranges.push({ id: c.id, from: anchor.from, to: anchor.to });
		}
		return ranges;
	});

	function handleDocChange(newContent: string) {
		content = newContent;
		saveStatus = 'pending';
		if (autoSaveTimer) clearTimeout(autoSaveTimer);
		autoSaveTimer = setTimeout(doSaveDraft, 30_000);
	}

	async function doSaveDraft() {
		if (!isDirty) return;
		saveStatus = 'saving';
		try {
			await trpc.documents.saveDraft.mutate({ documentId: data.document.id, content });
			lastSavedContent = content;
			saveStatus = 'saved';
			setTimeout(() => {
				if (saveStatus === 'saved') saveStatus = 'idle';
			}, 2000);
		} catch {
			saveStatus = 'error';
		}
	}

	async function doCommit() {
		if (!commitMessage.trim()) return;
		committing = true;
		commitError = '';
		try {
			if (isDirty) await doSaveDraft();
			await trpc.documents.commit.mutate({
				documentId: data.document.id,
				message: commitMessage.trim()
			});
			lastSavedContent = content;
			showCommit = false;
			commitMessage = '';
			saveStatus = 'idle';
			if (showHistory) await loadVersions();
		} catch (e) {
			commitError = e instanceof Error ? e.message : 'Error creating version';
		} finally {
			committing = false;
		}
	}

	async function loadVersions() {
		loadingVersions = true;
		try {
			versions = await trpc.documents.versions.query(data.document.id);
		} finally {
			loadingVersions = false;
		}
	}

	async function toggleHistory() {
		showHistory = !showHistory;
		if (showHistory) showComments = false;
		if (showHistory && versions.length === 0) await loadVersions();
		if (!showHistory) {
			selectedVersionId = null;
			compareDiff = null;
		}
	}

	function toggleComments() {
		showComments = !showComments;
		if (showComments) showHistory = false;
	}

	async function selectVersion(versionId: string) {
		if (selectedVersionId === versionId) {
			selectedVersionId = null;
			compareDiff = null;
			return;
		}
		selectedVersionId = versionId;
		loadingCompare = true;
		try {
			compareDiff = await trpc.documents.versionDiff.query({
				documentId: data.document.id,
				versionId
			});
		} finally {
			loadingCompare = false;
		}
	}

	async function restoreVersion(versionId: string) {
		if (compareDiff === null) return;
		await trpc.documents.restoreVersion.mutate({ documentId: data.document.id, versionId });
		content = compareDiff.current.content;
		lastSavedContent = compareDiff.current.content;
		saveStatus = 'pending';
		selectedVersionId = null;
		compareDiff = null;
		showHistory = false;
		if (autoSaveTimer) clearTimeout(autoSaveTimer);
		autoSaveTimer = setTimeout(doSaveDraft, 30_000);
	}

	async function submitComment() {
		if (!currentSelection || !newCommentText.trim()) return;
		submittingComment = true;
		try {
			const lineStart = posToLine(content, currentSelection.from);
			const lineEnd = posToLine(content, currentSelection.to);
			const created = await trpc.comments.createInline.mutate({
				documentId: data.document.id,
				content: newCommentText.trim(),
				anchorText: currentSelection.text,
				lineStart,
				lineEnd,
				characterStart: currentSelection.from,
				characterEnd: currentSelection.to
			});

			const newComment: InlineComment = {
				id: created.id,
				authorId: created.authorId,
				authorName: data.currentUserId === created.authorId ? (data as any).user?.name ?? '' : '',
				content: created.content,
				anchorText: created.anchorText,
				lineStart: created.lineStart,
				characterStart: created.characterStart,
				characterEnd: created.characterEnd,
				status: 'open',
				createdAt: created.createdAt,
				replies: []
			};

			inlineComments = [...inlineComments, newComment].sort(
				(a, b) => (a.characterStart ?? 0) - (b.characterStart ?? 0)
			);

			newCommentText = '';
			showNewComment = false;
			currentSelection = null;
			showComments = true;
		} finally {
			submittingComment = false;
		}
	}

	function handleCommentClick(id: string) {
		const c = inlineComments.find((x) => x.id === id);
		if (!c) return;
		const anchor = findAnchor(content, c.anchorText ?? '', c.characterStart ?? 0);
		if (anchor) scrollToRange = { ...anchor };
	}

	function handleCommentResolved(id: string) {
		inlineComments = inlineComments.map((c) =>
			c.id === id ? { ...c, status: 'resolved' } : c
		);
	}

	function handleCommentReopened(id: string) {
		inlineComments = inlineComments.map((c) =>
			c.id === id ? { ...c, status: 'open' } : c
		);
	}

	function handleReplyAdded(commentId: string, reply: Reply) {
		inlineComments = inlineComments.map((c) =>
			c.id === commentId ? { ...c, replies: [...c.replies, reply] } : c
		);
	}

	const saveStatusLabel: Record<'idle' | 'pending' | 'saving' | 'saved' | 'error', string> = {
		idle: '',
		pending: 'Unsaved changes',
		saving: 'Saving...',
		saved: 'Saved',
		error: 'Error saving'
	};

	const openCommentsCount = $derived(inlineComments.filter((c) => c.status === 'open').length);

	// Export dropdown
	let showExport = $state(false);

	// ── Chat assistant ───────────────────────────────────────────────────────────
	let showChat = $state(false);

	function toggleChat() {
		showChat = !showChat;
		if (showChat) {

			showReview = false;
			showDraft = false;
			showHistory = false;
			showComments = false;
		}
	}

	// ── Review assistant ─────────────────────────────────────────────────────────
	type ReviewResult = {
		requirements: { name: string; covered: boolean; note: string }[];
		uncitedRefs: string[];
	};
	let showReview = $state(false);
	let loadingReview = $state(false);
	let reviewResult = $state<ReviewResult | null>(null);
	let reviewError = $state('');

	function toggleReview() {
		showReview = !showReview;
		if (showReview) {

			showChat = false;
			showDraft = false;
			showHistory = false;
			showComments = false;
		}
	}

	async function runReview() {
		if (loadingReview) return;
		loadingReview = true;
		reviewError = '';
		reviewResult = null;
		try {
			reviewResult = await trpc.ai.reviewDocument.mutate({
				projectId: data.document.projectId,
				documentId: data.document.id
			});
		} catch (e: unknown) {
			reviewError = e instanceof Error ? e.message : 'Error al revisar el documento.';
		} finally {
			loadingReview = false;
		}
	}

	// ── Draft assistant ──────────────────────────────────────────────────────────
	let showDraft = $state(false);
	let draftMode = $state<'new' | 'rewrite'>('new');
	let draftInstruction = $state('');
	let draftResult = $state('');
	let loadingDraft = $state(false);
	let draftError = $state('');

	// Rewrite mode — snapshot of the selected range
	type SelectionSnapshot = { text: string; from: number; to: number };
	let capturedSelection = $state<SelectionSnapshot | null>(null);

	function toggleDraft() {
		showDraft = !showDraft;
		if (showDraft) {

			showChat = false;
			showReview = false;
			showHistory = false;
			showComments = false;
		} else {
			capturedSelection = null;
			draftResult = '';
		}
	}

	function setDraftMode(m: 'new' | 'rewrite') {
		draftMode = m;
		draftResult = '';
		draftError = '';
		capturedSelection = null;
	}

	function captureSelection() {
		const sel = editorEl?.getSelection() ?? null;
		capturedSelection = sel;
		draftResult = '';
		draftError = '';
	}

	async function runDraft() {
		if (!draftInstruction.trim() || loadingDraft) return;
		if (draftMode === 'rewrite' && !capturedSelection) return;
		loadingDraft = true;
		draftError = '';
		draftResult = '';
		try {
			if (draftMode === 'rewrite') {
				const instruction = `Rewrite the following text fragment according to this instruction: ${draftInstruction}\n\nOriginal text:\n${capturedSelection!.text}`;
				const { text } = await trpc.ai.draftSection.mutate({
					projectId: data.document.projectId,
					instruction,
					documentContext: undefined
				});
				draftResult = text;
			} else {
				const preview = content.slice(-2000);
				const { text } = await trpc.ai.draftSection.mutate({
					projectId: data.document.projectId,
					instruction: draftInstruction,
					documentContext: preview || undefined
				});
				draftResult = text;
			}
		} catch (e: unknown) {
			draftError = e instanceof Error ? e.message : 'Error generating draft.';
		} finally {
			loadingDraft = false;
		}
	}

	function acceptDraft() {
		if (!draftResult) return;
		if (draftMode === 'rewrite' && capturedSelection) {
			const wrapped = `> ⚠️ AI DRAFT — review and rewrite before publishing\n\n${draftResult}\n\n> ⚠️ END AI DRAFT`;
			editorEl?.replaceRange(capturedSelection.from, capturedSelection.to, wrapped);
			capturedSelection = null;
		} else {
			const wrapped = `\n\n> ⚠️ AI DRAFT — review and rewrite before publishing\n\n${draftResult}\n\n> ⚠️ END AI DRAFT\n\n`;
			editorEl?.insertAtCursor(wrapped);
		}
		draftResult = '';
		draftInstruction = '';
	}

	function rejectDraft() {
		draftResult = '';
	}

	onDestroy(() => {
		if (autoSaveTimer) clearTimeout(autoSaveTimer);
	});
</script>

{#if data.document}
<!-- Mobile view -->
<div class="sm:hidden">
	{#if data.document.type === 'notes'}
		<MobileNoteEditor
			bind:content
			{saveStatus}
			{isDirty}
			projectTitle={data.projectTitle}
			projectId={data.document.projectId}
			documentTitle={data.document.title}
			onchange={handleDocChange}
			onsave={doSaveDraft}
		/>
	{:else}
		<!-- Read-only rendered view for non-notes documents -->
		<div class="flex h-screen flex-col bg-paper dark:bg-dark-paper">
			<div class="flex shrink-0 items-center gap-3 border-b border-paper-border bg-paper/95 px-4 py-3 backdrop-blur-sm dark:border-dark-paper-border dark:bg-dark-paper/95">
				<button
					onclick={() => { window.location.href = `/projects/${data.document.projectId}`; }}
					class="flex items-center gap-1.5 font-sans text-sm text-ink-muted dark:text-dark-ink-muted"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M15 18l-6-6 6-6" />
					</svg>
					{data.projectTitle}
				</button>
				<span class="text-ink-faint dark:text-dark-ink-faint">/</span>
				<span class="truncate font-sans text-sm font-medium text-ink dark:text-dark-ink">{data.document.title}</span>
			</div>
			<div class="flex-1 overflow-y-auto px-4 py-6 pb-safe">
				{#if content.trim()}
					<MarkdownPreview {content} projectId={data.document.projectId} docMap={docMap()} />
				{:else}
					<p class="font-sans text-sm text-ink-faint dark:text-dark-ink-faint">Empty document.</p>
				{/if}
			</div>
		</div>
	{/if}
</div>

<!-- Desktop editor -->
<div class="hidden sm:block">

<!-- Sticky toolbar -->
<div
	class="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-paper-border bg-paper/95 px-6 py-3 backdrop-blur-sm dark:border-dark-paper-border dark:bg-dark-paper/95"
>
	<div class="flex min-w-0 items-center gap-2 font-sans text-sm">
		<button
			onclick={() => (window.location.href = `/projects/${data.document.projectId}`)}
			class="shrink-0 text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
		>
			{data.projectTitle}
		</button>
		<span class="text-ink-faint dark:text-dark-ink-faint">/</span>
		<span class="truncate font-medium text-ink dark:text-dark-ink">{data.document.title}</span>
	</div>

	<div class="flex shrink-0 items-center gap-3">
		{#if saveStatus !== 'idle'}
			<span
				class="font-sans text-xs {saveStatus === 'error'
					? 'text-red-500'
					: saveStatus === 'saved'
						? 'text-green-600'
						: 'text-ink-faint dark:text-dark-ink-faint'}"
			>
				{saveStatusLabel[saveStatus]}
			</span>
		{/if}

		<button
			onclick={doSaveDraft}
			disabled={!isDirty || saveStatus === 'saving'}
			class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui disabled:opacity-40 dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
		>
			Save
		</button>

		{#if data.document.type === 'book'}
			<a
				href="/projects/{data.document.projectId}/documents/{data.document.id}/read"
				class="flex items-center gap-1.5 rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
					<path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
				</svg>
				Read
			</a>
		{/if}

		<!-- Chat assistant button -->
		<button
			type="button"
			onclick={toggleChat}
			title="Chat with the assistant about this document"
			class="flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-sans text-sm transition-colors {showChat
				? 'border-accent bg-accent/10 text-accent dark:border-accent dark:text-accent'
				: 'border-paper-border text-ink-muted hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui'}"
		>
			<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
			Chat
		</button>

		<!-- Review button -->
		<button
			type="button"
			onclick={toggleReview}
			title="Review document against project requirements"
			class="flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-sans text-sm transition-colors {showReview
				? 'border-accent bg-accent/10 text-accent dark:border-accent dark:text-accent'
				: 'border-paper-border text-ink-muted hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui'}"
		>
			<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path d="M9 11l3 3L22 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
				<path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
			Review
		</button>

		<!-- Draft assistant button -->
		{#if viewMode !== 'preview'}
			<button
				type="button"
				onclick={toggleDraft}
				title="Draft assistant — generate text from your project context"
				class="flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-sans text-sm transition-colors {showDraft
					? 'border-accent bg-accent/10 text-accent dark:border-accent dark:text-accent'
					: 'border-paper-border text-ink-muted hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui'}"
			>
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path d="M12 19l7-7 3 3-7 7-3-3z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
					<path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
				Draft
			</button>
		{/if}

		<!-- Citar button (editor + split) -->
		{#if viewMode !== 'preview'}
			<button
				onclick={openCitePicker}
				title="Insert bibliographic citation"
				class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
			>
				[@cite]
			</button>
		{/if}

		<!-- Citation style selector (preview + split) -->
		{#if viewMode !== 'editor'}
			<div class="flex overflow-hidden rounded-md border border-paper-border dark:border-dark-paper-border">
				{#each Object.entries(CITATION_STYLE_LABELS) as [s, label] (s)}
					<button
						onclick={() => setCitationStyle(s as CitationStyle)}
						class="px-2.5 py-1.5 font-sans text-xs transition-colors {citationStyle === s
							? 'bg-accent text-white'
							: 'text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui'}"
					>
						{label}
					</button>
				{/each}
			</div>
		{/if}

		<button
			onclick={toggleComments}
			class="relative rounded-md border px-3 py-1.5 font-sans text-sm transition-colors {showComments
				? 'border-amber-400 bg-amber-400/10 text-amber-700 dark:text-amber-300'
				: 'border-paper-border text-ink-muted hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui'}"
		>
			Comments
			{#if openCommentsCount > 0}
				<span
					class="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 font-sans text-xs font-semibold text-white"
				>
					{openCommentsCount}
				</span>
			{/if}
		</button>

		<!-- View mode selector -->
		<div class="flex overflow-hidden rounded-md border border-paper-border dark:border-dark-paper-border" role="group" aria-label="Modo de vista">
			<button
				onclick={() => setViewMode('editor')}
				title="Solo editor"
				class="px-2.5 py-1.5 transition-colors {viewMode === 'editor' ? 'bg-accent text-white' : 'text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui'}"
				aria-pressed={viewMode === 'editor'}
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path d="M4 6h16M4 10h10M4 14h12M4 18h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
				</svg>
			</button>
			<button
				onclick={() => setViewMode('split')}
				title="Editor y vista previa"
				class="border-x border-paper-border px-2.5 py-1.5 transition-colors dark:border-dark-paper-border {viewMode === 'split' ? 'bg-accent text-white' : 'text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui'}"
				aria-pressed={viewMode === 'split'}
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<rect x="2" y="3" width="9" height="18" rx="1" stroke="currentColor" stroke-width="1.5"/>
					<rect x="13" y="3" width="9" height="18" rx="1" stroke="currentColor" stroke-width="1.5"/>
				</svg>
			</button>
			<button
				onclick={() => setViewMode('preview')}
				title="Solo vista previa"
				class="px-2.5 py-1.5 transition-colors {viewMode === 'preview' ? 'bg-accent text-white' : 'text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui'}"
				aria-pressed={viewMode === 'preview'}
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" stroke="currentColor" stroke-width="1.5"/>
					<circle cx="12" cy="12" r="2.5" stroke="currentColor" stroke-width="1.5"/>
				</svg>
			</button>
		</div>

		<button
			onclick={toggleHistory}
			class="rounded-md border px-3 py-1.5 font-sans text-sm transition-colors {showHistory
				? 'border-accent bg-accent text-white'
				: 'border-paper-border text-ink-muted hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui'}"
		>
			History
</button>

		<a
			href="/help"
			target="_blank"
			rel="noopener noreferrer"
			title="Syntax guide"
			class="flex h-7 w-7 items-center justify-center rounded-full border border-paper-border font-sans text-sm text-ink-faint transition-colors hover:border-ink-muted hover:text-ink-muted dark:border-dark-paper-border dark:text-dark-ink-faint dark:hover:border-dark-ink-muted dark:hover:text-dark-ink-muted"
		>
			?
		</a>

		<!-- Export dropdown -->
		<div class="relative">
			<button
				onclick={() => (showExport = !showExport)}
				class="flex items-center gap-1 rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
			>
				Exportar
				<svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
					<path d="M2 3.5l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
			</button>
			{#if showExport}
				<button
					class="fixed inset-0 z-10"
					onclick={() => (showExport = false)}
					aria-label="Close menu"
					tabindex="-1"
				></button>
				<div class="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-xl border border-paper-border bg-paper shadow-lg dark:border-dark-paper-border dark:bg-dark-paper">
					<a
						href="/api/projects/{data.document.projectId}/documents/{data.document.id}/export?format=latex"
						onclick={() => (showExport = false)}
						class="flex items-center gap-2.5 px-4 py-2.5 font-sans text-sm text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
					>
						<span class="font-mono text-xs text-ink-faint dark:text-dark-ink-faint">.tex</span>
						LaTeX
					</a>
					<a
						href="/api/projects/{data.document.projectId}/documents/{data.document.id}/export?format=typst"
						onclick={() => (showExport = false)}
						class="flex items-center gap-2.5 px-4 py-2.5 font-sans text-sm text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
					>
						<span class="font-mono text-xs text-ink-faint dark:text-dark-ink-faint">.typ</span>
						Typst
					</a>
				</div>
			{/if}
		</div>

		<button
			onclick={togglePublic}
			title={isPublic ? 'Public document — visible to everyone as AI context. Click to make private.' : 'Private document. Click to make public.'}
			class="flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-sans text-sm transition-colors {isPublic
				? 'border-green-400/60 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-500/40 dark:bg-green-950/30 dark:text-green-400'
				: 'border-paper-border text-ink-muted hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui'}"
		>
			{#if isPublic}
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/>
					<path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
				</svg>
				Public
			{:else}
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" stroke-width="1.5"/>
					<path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
				</svg>
				Privado
			{/if}
		</button>

		<button
			onclick={() => (showDeleteDoc = true)}
			title="Eliminar documento"
			class="flex h-7 w-7 items-center justify-center rounded-md border border-paper-border text-ink-faint transition-colors hover:border-red-300 hover:text-red-500 dark:border-dark-paper-border dark:text-dark-ink-faint dark:hover:border-red-700 dark:hover:text-red-400"
			aria-label="Eliminar documento"
		>
			<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
		</button>

		<button
			onclick={() => (showCommit = true)}
			disabled={!content.trim()}
			class="rounded-md bg-accent px-3 py-1.5 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
		>
			Commit
		</button>
	</div>
</div>

<SafeDeleteDialog
	open={showDeleteDoc}
	label="el documento"
	warning="The content, version history and associated comments will be permanently deleted."
	deleting={deletingDoc}
	onconfirm={handleDeleteDoc}
	oncancel={() => (showDeleteDoc = false)}
/>

<!-- Main layout -->
<div class="flex overflow-hidden" style="height: calc(100vh - 57px)">
	{#if viewMode === 'split'}
		<!-- Split: editor left, preview right -->
		<div class="relative flex flex-1 overflow-hidden">
			<div class="flex-1 overflow-y-auto border-r border-paper-border px-6 py-10 dark:border-dark-paper-border">
				<div class="mx-auto w-full max-w-2xl">
					<MarkdownEditor
						bind:this={editorEl}
						bind:value={content}
						references={projectRefs}
						{chapters}
						ondocchange={handleDocChange}
						onselectionchange={(sel) => {
							currentSelection = sel;
							if (!sel) showNewComment = false;
						}}
						{commentRanges}
						{scrollToRange}
					/>
				</div>
			</div>
			<div class="flex-1 overflow-y-auto px-6 py-10">
				<div class="mx-auto w-full max-w-2xl">
					<MarkdownPreview
						{content}
						projectId={data.document.projectId}
						references={projectRefs}
						{citationStyle}
						docMap={docMap()}
					/>
				</div>
			</div>
		</div>
	{:else}
	<!-- Editor / Preview (single panel) -->
	<div class="relative flex-1 overflow-y-auto px-6 py-10">
		<div class="mx-auto w-full max-w-2xl">
			{#if viewMode === 'preview'}
				<MarkdownPreview
					{content}
					projectId={data.document.projectId}
					references={projectRefs}
					{citationStyle}
					docMap={docMap()}
				/>
			{:else}
				<MarkdownEditor
					bind:this={editorEl}
					bind:value={content}
					references={projectRefs}
					{chapters}
					ondocchange={handleDocChange}
					onselectionchange={(sel) => {
						currentSelection = sel;
						if (!sel) showNewComment = false;
					}}
					{commentRanges}
					{scrollToRange}
				/>
			{/if}
		</div>

		<!-- Floating "Comentar" button -->
		{#if currentSelection && currentSelection.coords && !showNewComment}
			<div
				class="pointer-events-none fixed z-20"
				style="top: {currentSelection.coords.bottom + 8}px; left: {currentSelection.coords.left}px;"
			>
				<button
					class="pointer-events-auto rounded-md bg-amber-400 px-3 py-1.5 font-sans text-xs font-semibold text-white shadow-md transition-colors hover:bg-amber-500"
					onclick={() => {
						showNewComment = true;
						showComments = true;
						showHistory = false;
					}}
				>
					+ Comment
				</button>
			</div>
		{/if}

		<!-- New comment popover (anchored near selection) -->
		{#if showNewComment && currentSelection && currentSelection.coords}
			<div
				class="pointer-events-none fixed z-20"
				style="top: {currentSelection.coords.bottom + 8}px; left: {currentSelection.coords.left}px;"
			>
				<div
					class="pointer-events-auto w-72 rounded-xl border border-paper-border bg-paper p-3 shadow-xl dark:border-dark-paper-border dark:bg-dark-paper"
				>
					<p class="mb-2 truncate border-l-2 border-amber-400 pl-2 font-sans text-xs italic text-ink-muted dark:text-dark-ink-muted">
						«{currentSelection.text.slice(0, 60)}{currentSelection.text.length > 60 ? '…' : ''}»
					</p>
					<textarea
						bind:value={newCommentText}
						rows={3}
						placeholder="Write your comment…"
						class="w-full resize-none rounded-md border border-paper-border bg-paper-ui px-2 py-1.5 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
					></textarea>
					<div class="mt-2 flex gap-2">
						<button
							onclick={submitComment}
							disabled={submittingComment || !newCommentText.trim()}
							class="flex-1 rounded-md bg-accent py-1.5 font-sans text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
						>
							{submittingComment ? 'Saving…' : 'Comment'}
						</button>
						<button
							onclick={() => {
								showNewComment = false;
								newCommentText = '';
							}}
							class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted"
						>
							Cancel
						</button>
					</div>
				</div>
			</div>
		{/if}
	</div>
	{/if}

	<!-- Comments sidebar -->
	{#if showComments}
		<div
			class="flex w-80 shrink-0 flex-col overflow-hidden border-l border-paper-border bg-paper dark:border-dark-paper-border dark:bg-dark-paper"
		>
			<div
				class="flex items-center justify-between border-b border-paper-border px-4 py-3 dark:border-dark-paper-border"
			>
				<h3 class="font-serif text-sm font-semibold text-ink dark:text-dark-ink">Comments</h3>
				<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
					{openCommentsCount} abierto{openCommentsCount !== 1 ? 's' : ''}
				</span>
			</div>

			<div class="flex-1 space-y-2 overflow-y-auto p-3">
				{#if inlineComments.length === 0}
					<p class="px-1 py-6 text-center font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
						No comments yet.<br />
						<span class="text-xs text-ink-faint dark:text-dark-ink-faint">Selecciona texto para comentar.</span>
					</p>
				{:else}
					{#each inlineComments as c (c.id)}
						<CommentThread
							comment={{ ...c, resolved: c.status === 'resolved' }}
							currentUserId={data.currentUserId}
							onclick={handleCommentClick}
							onresolved={handleCommentResolved}
							onreopened={handleCommentReopened}
							onreplyadded={handleReplyAdded}
							ondeleted={(id) => { inlineComments = inlineComments.filter((x) => x.id !== id); }}
						/>
					{/each}
				{/if}
			</div>
		</div>
	{/if}

	<!-- Backlinks panel -->
	{#if backlinks.length > 0}
		<div class="flex w-56 shrink-0 flex-col overflow-hidden border-l border-paper-border bg-paper dark:border-dark-paper-border dark:bg-dark-paper">
			<div class="border-b border-paper-border px-4 py-3 dark:border-dark-paper-border">
				<h3 class="font-serif text-sm font-semibold text-ink dark:text-dark-ink">Mencionado en</h3>
			</div>
			<div class="flex-1 overflow-y-auto p-2">
				{#each backlinks as link (link.id)}
					<a
						href="/projects/{data.document.projectId}/documents/{link.id}"
						class="flex items-center gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-paper-ui dark:hover:bg-dark-paper-ui"
					>
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" class="shrink-0 text-accent" aria-hidden="true">
							<path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
							<path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
						</svg>
						<span class="truncate font-sans text-xs text-ink-muted dark:text-dark-ink-muted">{link.title}</span>
					</a>
				{/each}
			</div>
		</div>
	{/if}



	<!-- Chat assistant sidebar -->
	{#if showChat}
		<div class="flex w-80 shrink-0 flex-col overflow-hidden border-l border-paper-border dark:border-dark-paper-border">
			<AiEditorPanel
				projectId={data.document.projectId}
				documentId={data.document.id}
				documentTitle={data.document.title}
				onClose={toggleChat}
			/>
		</div>
	{/if}

	<!-- Review sidebar -->
	{#if showReview}
		<div class="flex w-80 shrink-0 flex-col overflow-hidden border-l border-paper-border bg-paper dark:border-dark-paper-border dark:bg-dark-paper">
			<div class="flex items-center justify-between border-b border-paper-border px-4 py-3 dark:border-dark-paper-border">
				<h3 class="font-serif text-sm font-semibold text-ink dark:text-dark-ink">Document review</h3>
				<div class="flex items-center gap-2">
					{#if loadingReview}
						<div class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
					{/if}
					<button
						type="button"
						onclick={toggleReview}
						class="text-ink-faint transition-colors hover:text-ink-muted dark:text-dark-ink-faint dark:hover:text-dark-ink-muted"
						aria-label="Close review"
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
						</svg>
					</button>
				</div>
			</div>

			<div class="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
				{#if !reviewResult && !loadingReview}
					<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
						Checks each project requirement against the document content, and identifies relevant references that aren't cited yet.
					</p>
					<button
						type="button"
						onclick={runReview}
						class="flex items-center justify-center gap-2 rounded-lg bg-accent py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover"
					>
						Run review
					</button>
				{/if}

				{#if loadingReview && !reviewResult}
					<p class="py-6 text-center font-sans text-sm text-ink-muted dark:text-dark-ink-muted">Analysing document…</p>
				{/if}

				{#if reviewError}
					<p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-xs text-red-600 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-400">
						{reviewError}
					</p>
				{/if}

				{#if reviewResult}
					<!-- Requirements checklist -->
					{#if reviewResult.requirements.length > 0}
						<div>
							<p class="mb-2 font-sans text-[11px] font-medium tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint">
								Requirements
							</p>
							<div class="flex flex-col gap-2">
								{#each reviewResult.requirements as req}
									<div class="rounded-lg border {req.covered ? 'border-green-200 bg-green-50 dark:border-green-800/40 dark:bg-green-900/10' : 'border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-900/10'} px-3 py-2">
										<div class="flex items-start gap-2">
											<span class="mt-0.5 shrink-0 text-sm {req.covered ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}">
												{req.covered ? '✓' : '✗'}
											</span>
											<div>
												<p class="font-sans text-xs font-medium text-ink dark:text-dark-ink">{req.name}</p>
												{#if req.note}
													<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">{req.note}</p>
												{/if}
											</div>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Uncited references -->
					{#if reviewResult.uncitedRefs.length > 0}
						<div>
							<p class="mb-2 font-sans text-[11px] font-medium tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint">
								Relevant but uncited
							</p>
							<div class="flex flex-col gap-1.5">
								{#each reviewResult.uncitedRefs as citeKey}
									<button
										type="button"
										onclick={() => editorEl?.insertAtCursor(`[@${citeKey}]`)}
										title="Insert citation"
										class="flex items-center justify-between rounded-md border border-paper-border bg-paper-ui px-3 py-2 text-left transition-colors hover:border-accent/40 dark:border-dark-paper-border dark:bg-dark-paper-ui"
									>
										<span class="font-mono text-xs text-ink dark:text-dark-ink">[@{citeKey}]</span>
										<span class="font-sans text-[10px] text-ink-faint dark:text-dark-ink-faint">insert</span>
									</button>
								{/each}
							</div>
						</div>
					{:else if reviewResult.requirements.length > 0}
						<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
							All relevant references are cited.
						</p>
					{/if}

					<button
						type="button"
						onclick={runReview}
						disabled={loadingReview}
						class="mt-auto rounded-md border border-paper-border px-3 py-1.5 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-ui disabled:opacity-40 dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
					>
						Re-run review
					</button>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Draft assistant sidebar -->
	{#if showDraft}
		<div class="flex w-80 shrink-0 flex-col overflow-hidden border-l border-paper-border bg-paper dark:border-dark-paper-border dark:bg-dark-paper">
			<div class="flex items-center justify-between border-b border-paper-border px-4 py-3 dark:border-dark-paper-border">
				<h3 class="font-serif text-sm font-semibold text-ink dark:text-dark-ink">Draft assistant</h3>
				<button
					type="button"
					onclick={toggleDraft}
					class="text-ink-faint transition-colors hover:text-ink-muted dark:text-dark-ink-faint dark:hover:text-dark-ink-muted"
					aria-label="Close draft assistant"
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
					</svg>
				</button>
			</div>

			<div class="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
				<!-- Mode toggle -->
				<div class="flex overflow-hidden rounded-lg border border-paper-border dark:border-dark-paper-border">
					<button
						type="button"
						onclick={() => setDraftMode('new')}
						class="flex-1 py-1.5 font-sans text-xs transition-colors {draftMode === 'new' ? 'bg-accent text-white' : 'text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui'}"
					>
						New text
					</button>
					<button
						type="button"
						onclick={() => setDraftMode('rewrite')}
						class="flex-1 border-l border-paper-border py-1.5 font-sans text-xs transition-colors dark:border-dark-paper-border {draftMode === 'rewrite' ? 'bg-accent text-white' : 'text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui'}"
					>
						Rewrite selection
					</button>
				</div>

				{#if draftMode === 'new'}
					<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
						Describe what to write. The assistant will use your project references, requirements, and existing documents as context.
					</p>
				{:else}
					<!-- Rewrite mode: capture selection -->
					<div class="flex flex-col gap-2">
						<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
							Select text in the editor, then capture it here.
						</p>
						<button
							type="button"
							onclick={captureSelection}
							class="rounded-lg border border-paper-border px-3 py-1.5 font-sans text-xs text-ink-muted transition-colors hover:border-accent/40 hover:text-ink dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:text-dark-ink"
						>
							Capture selection
						</button>
						{#if capturedSelection}
							<div class="rounded-lg border border-paper-border bg-paper-ui px-3 py-2 font-mono text-xs text-ink-muted dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink-muted" style="max-height: 80px; overflow-y: auto;">
								{capturedSelection.text}
							</div>
						{/if}
					</div>
				{/if}

				<textarea
					bind:value={draftInstruction}
					placeholder={draftMode === 'new'
						? 'E.g.: Write an introductory paragraph for the methodology section…'
						: 'E.g.: Make this more formal, add a citation, expand this argument…'}
					rows="3"
					class="w-full resize-none rounded-lg border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
				></textarea>

				<button
					type="button"
					onclick={runDraft}
					disabled={!draftInstruction.trim() || loadingDraft || (draftMode === 'rewrite' && !capturedSelection)}
					class="flex items-center justify-center gap-2 rounded-lg bg-accent py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
				>
					{#if loadingDraft}
						<span class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
						Generating…
					{:else}
						Generate
					{/if}
				</button>

				{#if draftError}
					<p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-xs text-red-600 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-400">
						{draftError}
					</p>
				{/if}

				{#if draftResult}
					<div class="flex flex-col gap-2">
						<!-- Diff preview: original → new (rewrite mode only) -->
						{#if draftMode === 'rewrite' && capturedSelection}
							<div class="rounded-xl border border-accent/20 bg-accent/5 p-3">
								<div class="mb-2 space-y-1 rounded-md bg-paper px-2.5 py-2 font-mono text-xs dark:bg-dark-paper">
									<p class="text-red-500 line-through opacity-70">{capturedSelection.text}</p>
									<p class="text-green-600 dark:text-green-400">{draftResult}</p>
								</div>
							</div>
						{:else}
							<div class="rounded-lg border border-paper-border bg-paper-ui px-3 py-2.5 font-sans text-sm leading-relaxed text-ink dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink" style="white-space: pre-wrap;">
								{draftResult}
							</div>
						{/if}
						<div class="flex gap-2">
							<button
								type="button"
								onclick={acceptDraft}
								class="flex-1 rounded-md bg-accent py-1.5 font-sans text-xs font-medium text-white transition-colors hover:bg-accent-hover"
							>
								{draftMode === 'rewrite' ? 'Accept' : 'Insert at cursor'}
							</button>
							<button
								type="button"
								onclick={rejectDraft}
								class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted"
							>
								Reject
							</button>
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Version history sidebar -->
	{#if showHistory}
		<div
			class="flex w-80 shrink-0 flex-col overflow-hidden border-l border-paper-border bg-paper dark:border-dark-paper-border dark:bg-dark-paper"
		>
			<div
				class="flex items-center justify-between border-b border-paper-border px-4 py-3 dark:border-dark-paper-border"
			>
				<h3 class="font-serif text-sm font-semibold text-ink dark:text-dark-ink">
					Version history
				</h3>
				{#if loadingVersions}
					<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">Cargando...</span>
				{/if}
			</div>

			<div class="flex-1 overflow-y-auto">
				{#if versions.length === 0 && !loadingVersions}
					<div
						class="px-4 py-8 text-center font-sans text-sm text-ink-muted dark:text-dark-ink-muted"
					>
						No saved versions yet.
					</div>
				{:else}
					<ul class="divide-y divide-paper-border dark:divide-dark-paper-border">
						{#each versions as v (v.id)}
							<li class="px-4 py-3">
								<div class="flex items-start justify-between gap-2">
									<div class="min-w-0">
										<p class="font-sans text-xs font-semibold text-accent">v{v.versionNumber}</p>
										<p class="mt-0.5 truncate font-sans text-sm text-ink dark:text-dark-ink">
											{v.changeDescription ?? 'No description'}
										</p>
										<p class="mt-0.5 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
											{new Intl.DateTimeFormat('es', {
												day: 'numeric',
												month: 'short',
												hour: '2-digit',
												minute: '2-digit'
											}).format(new Date(v.createdAt))}
										</p>
									</div>
									<div class="flex shrink-0 flex-col gap-1">
										<button
											onclick={() => window.open(`/projects/${data.document.projectId}/documents/${data.document.id}/diff/${v.id}`, '_blank')}
											class="rounded px-2 py-1 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
										>
											Compare ↗
										</button>
										{#if selectedVersionId === v.id && compareDiff !== null}
											<button
												onclick={() => restoreVersion(v.id)}
												class="rounded px-2 py-1 font-sans text-xs text-accent transition-colors hover:underline"
											>
												Restaurar
											</button>
										{/if}
									</div>
								</div>

								{#if selectedVersionId === v.id}
									<div class="mt-3">
										{#if loadingCompare}
											<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
												Cargando diff...
											</p>
										{:else if compareDiff !== null}
											<DiffViewer
												oldText={compareDiff.previous?.content ?? ''}
												newText={compareDiff.current.content}
												oldLabel={compareDiff.previous ? `v${compareDiff.previous.versionNumber}` : '(empty)'}
												newLabel="v{v.versionNumber}"
											/>
										{/if}
									</div>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	{/if}
</div>

<!-- Cite picker modal -->
{#if showCitePicker}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm sm:items-center"
		onclick={(e) => { if (e.target === e.currentTarget) showCitePicker = false; }}
	>
		<div class="w-full max-w-sm rounded-t-2xl border border-paper-border bg-paper shadow-2xl dark:border-dark-paper-border dark:bg-dark-paper sm:rounded-2xl">
			<div class="flex items-center justify-between border-b border-paper-border px-5 py-3.5 dark:border-dark-paper-border">
				<h2 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">Insertar cita</h2>
				<button
					onclick={() => (showCitePicker = false)}
					aria-label="Cerrar"
					class="rounded-md p-1 text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
				>
					<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
						<path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
					</svg>
				</button>
			</div>

			<div class="px-4 pt-3">
				<input
					type="search"
					bind:value={citeSearch}
					placeholder="Search by author, title or key…"
					class="w-full rounded-lg border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
				/>
			</div>

			<div class="max-h-72 overflow-y-auto px-2 py-2">
				{#if !refsLoaded}
					<p class="px-3 py-4 text-center font-sans text-sm text-ink-faint dark:text-dark-ink-faint">Cargando…</p>
				{:else if projectRefs.length === 0}
					<div class="px-3 py-6 text-center">
						<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">Sin referencias en este proyecto.</p>
						<a
							href="/projects/{data.document.projectId}/bib"
							class="mt-1 block font-sans text-xs text-accent hover:underline"
						>
							Go to Bibliography →
						</a>
					</div>
				{:else if filteredRefs().length === 0}
					<p class="px-3 py-4 text-center font-sans text-sm text-ink-faint dark:text-dark-ink-faint">Sin resultados.</p>
				{:else}
					{#each filteredRefs() as ref (ref.citeKey)}
						<button
							onclick={() => insertCitation(ref)}
							class="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-paper-ui dark:hover:bg-dark-paper-ui"
						>
							<span class="mt-0.5 shrink-0 rounded-md border border-accent/30 bg-accent/5 px-1.5 py-0.5 font-mono text-xs text-accent">
								{ref.citeKey}
							</span>
							<span class="min-w-0">
								<span class="block truncate font-sans text-sm text-ink dark:text-dark-ink">{ref.title}</span>
								<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
									{(ref.authors[0]?.last ?? '')}{ ref.authors.length > 1 ? ' et al.' : ''}{ref.year ? ' · ' + ref.year : ''}
								</span>
							</span>
						</button>
					{/each}
				{/if}
			</div>
		</div>
	</div>
{/if}

<!-- Commit dialog -->
{#if showCommit}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-4 backdrop-blur-sm dark:bg-dark-ink/30"
	>
		<div
			class="w-full max-w-md rounded-2xl border border-paper-border bg-paper p-6 shadow-xl dark:border-dark-paper-border dark:bg-dark-paper"
		>
			<h2 class="font-serif text-xl font-semibold text-ink dark:text-dark-ink">Create version</h2>
			<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				Describe the changes in this version.
			</p>

			<div class="mt-4 flex flex-col gap-3">
				<textarea
					bind:value={commitMessage}
					rows={3}
					placeholder="E.g. Introduction revision and hypothesis adjustment"
					class="resize-none rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
				></textarea>

				{#if commitError}
					<p class="font-sans text-sm text-red-600 dark:text-red-400">{commitError}</p>
				{/if}

				<div class="flex gap-3">
					<button
						onclick={doCommit}
						disabled={committing || !commitMessage.trim()}
						class="flex-1 rounded-md bg-accent py-2.5 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
					>
						{committing ? 'Saving version...' : 'Create version'}
					</button>
					<button
						onclick={() => {
							showCommit = false;
							commitMessage = '';
							commitError = '';
						}}
						class="rounded-md border border-paper-border px-4 py-2.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted"
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

</div><!-- end desktop editor wrapper -->
{/if}

<svelte:window onkeydown={(e) => {
	if (e.key === '/' && (e.ctrlKey || e.metaKey)) {
		e.preventDefault();
		showCheatsheet = !showCheatsheet;
	}
	if (e.key === 'Escape') showCheatsheet = false;
}} />

{#if showCheatsheet}
	<div
		class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
		role="presentation"
		onclick={() => (showCheatsheet = false)}
	></div>

	<div class="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col overflow-hidden bg-paper shadow-2xl dark:bg-dark-paper">
		<div class="flex shrink-0 items-center justify-between border-b border-paper-border px-6 py-4 dark:border-dark-paper-border">
			<p class="font-serif text-lg font-semibold text-ink dark:text-dark-ink">Referencia de sintaxis</p>
			<button
				onclick={() => (showCheatsheet = false)}
				class="rounded p-1 text-ink-faint hover:text-ink dark:text-dark-ink-faint dark:hover:text-dark-ink"
				aria-label="Cerrar"
			>
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
				</svg>
			</button>
		</div>

		<div class="flex-1 overflow-y-auto px-6 py-5 space-y-6 font-sans text-sm">

			<div>
				<p class="mb-2 font-medium text-ink dark:text-dark-ink">Formato</p>
				<table class="w-full">
					<tbody class="divide-y divide-paper-border dark:divide-dark-paper-border">
						{#each [
							['# Title', 'Heading 1'],
							['## Section', 'Heading 2'],
							['**negrita**', 'Negrita'],
							['*cursiva*', 'Cursiva'],
							['`code`', 'Inline code'],
							['> cita', 'Bloque de cita'],
							['- elemento', 'Lista'],
							['1. elemento', 'Lista numerada'],
							['[texto](url)', 'Enlace'],
							['---', 'Separador'],
						] as item}
							<tr>
								<td class="py-1.5 pr-4 font-mono text-xs text-accent">{item[0]}</td>
								<td class="py-1.5 text-ink-muted dark:text-dark-ink-muted">{item[1]}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<div>
				<p class="mb-2 font-medium text-ink dark:text-dark-ink">Bibliographic citations</p>
				<table class="w-full">
					<tbody class="divide-y divide-paper-border dark:divide-dark-paper-border">
						<tr>
							<td class="py-1.5 pr-4 font-mono text-xs text-accent">[@citeKey]</td>
							<td class="py-1.5 text-ink-muted dark:text-dark-ink-muted">Single citation</td>
						</tr>
						<tr>
							<td class="py-1.5 pr-4 font-mono text-xs text-accent">[@key1; @key2]</td>
							<td class="py-1.5 text-ink-muted dark:text-dark-ink-muted">Multiple citations</td>
						</tr>
					</tbody>
				</table>
				<p class="mt-1.5 text-xs text-ink-faint dark:text-dark-ink-faint">Escribe <span class="font-mono">[@</span> para autocompletar.</p>
			</div>

			<div>
				<p class="mb-2 font-medium text-ink dark:text-dark-ink">Mathematics (KaTeX)</p>
				<table class="w-full">
					<tbody class="divide-y divide-paper-border dark:divide-dark-paper-border">
						<tr>
							<td class="py-1.5 pr-4 font-mono text-xs text-accent">$E = mc^2$</td>
							<td class="py-1.5 text-ink-muted dark:text-dark-ink-muted">Inline</td>
						</tr>
						<tr>
							<td class="py-1.5 pr-4 font-mono text-xs text-accent">$$...$$</td>
							<td class="py-1.5 text-ink-muted dark:text-dark-ink-muted">Bloque centrado</td>
						</tr>
					</tbody>
				</table>
			</div>

			<div>
				<p class="mb-2 font-medium text-ink dark:text-dark-ink">Formal logic</p>
				<table class="w-full">
					<tbody class="divide-y divide-paper-border dark:divide-dark-paper-border">
						{#each [
							['$\\neg p$', '¬p', 'Negation'],
							['$p \\land q$', 'p ∧ q', 'Conjunction'],
							['$p \\lor q$', 'p ∨ q', 'Disjunction'],
							['$p \\rightarrow q$', 'p → q', 'Implication'],
							['$p \\leftrightarrow q$', 'p ↔ q', 'Bicondicional'],
							['$\\forall x$', '∀x', 'Universal'],
							['$\\exists x$', '∃x', 'Existencial'],
							['$\\therefore$', '∴', 'Por tanto'],
							['$\\bot$ / $\\top$', '⊥ / ⊤', 'Contradiction / Tautology'],
						] as item}
							<tr>
								<td class="py-1.5 pr-3 font-mono text-xs text-accent">{item[0]}</td>
								<td class="py-1.5 pr-4 text-ink dark:text-dark-ink">{item[1]}</td>
								<td class="py-1.5 text-ink-muted dark:text-dark-ink-muted">{item[2]}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<div>
				<p class="mb-2 font-medium text-ink dark:text-dark-ink">Wikilinks</p>
				<table class="w-full">
					<tbody class="divide-y divide-paper-border dark:divide-dark-paper-border">
						<tr>
							<td class="py-1.5 pr-4 font-mono text-xs text-accent">[[Title]]</td>
							<td class="py-1.5 text-ink-muted dark:text-dark-ink-muted">Mismo proyecto</td>
						</tr>
						<tr>
							<td class="py-1.5 pr-4 font-mono text-xs text-accent">[[Title:hash]]</td>
							<td class="py-1.5 text-ink-muted dark:text-dark-ink-muted">Documento externo</td>
						</tr>
					</tbody>
				</table>
			</div>

			<div>
				<p class="mb-2 font-medium text-ink dark:text-dark-ink">Atajos de teclado</p>
				<table class="w-full">
					<tbody class="divide-y divide-paper-border dark:divide-dark-paper-border">
						{#each [
							['Ctrl+S', 'Guardar borrador'],
							['Ctrl+/', 'Esta referencia'],
							['Esc', 'Cerrar paneles'],
						] as item}
							<tr>
								<td class="py-1.5 pr-4">
									<kbd class="rounded border border-paper-border bg-paper-ui px-1.5 py-0.5 font-mono text-xs text-ink dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink">{item[0]}</kbd>
								</td>
								<td class="py-1.5 text-ink-muted dark:text-dark-ink-muted">{item[1]}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

		</div>
	</div>
{/if}
