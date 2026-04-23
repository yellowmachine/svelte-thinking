<script lang="ts">
	import { onMount, onDestroy, untrack } from 'svelte';
	import { goto, beforeNavigate } from '$app/navigation';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { page } from '$app/state';
	import { workspaceStore } from '$lib/stores/workspace.svelte';
	import MobileNoteEditor from '$lib/components/editor/MobileNoteEditor.svelte';
	import MarkdownEditor from '$lib/components/editor/MarkdownEditor.svelte';
	import MarkdownPreview from '$lib/components/editor/MarkdownPreview.svelte';
	import DiffViewer from '$lib/components/editor/DiffViewer.svelte';
	import CommentThread from '$lib/components/editor/CommentThread.svelte';
	import SafeDeleteDialog from '$lib/components/ui/SafeDeleteDialog.svelte';
	import AiEditorPanel from '$lib/components/ai/AiEditorPanel.svelte';
	import SpellCheckPanel, { type SpellCorrection } from '$lib/components/editor/SpellCheckPanel.svelte';
	import { trpc } from '$lib/utils/trpc';
	import { onlineStore } from '$lib/stores/online.svelte';
	import { offlineDb } from '$lib/offline.db';
	import {
		findAnchor,
		posToLine,
		type CommentRange
	} from '$lib/components/editor/commentsExtension';
	import {
		CITATION_STYLE_LABELS,
		formatFullCitation,
		type CitationStyle,
		type CiteRef
	} from '$lib/utils/citations';
	import { MODEL_SHORT_LABEL } from '$lib/ai-config';
	import { SPELL_LANGUAGES } from '$lib/spell-languages';
	import {
		getSaveDraftCapability,
		getCommitCapability,
		getReclaimWritingCapability,
		getReleaseWriterCapability,
		canTriggerSave,
		canTriggerCommit
	} from '$lib/domain/document-capabilities';
	import { isProjectOwner, canWriteDocument, type CollaboratorRole } from '$lib/domain/permissions';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// untrack: read from props once without creating a reactive dependency
	let content = $state(untrack(() => data.document?.content ?? ''));
	let lastSavedContent = $state(untrack(() => data.document?.content ?? ''));
	const isDirty = $derived(content !== lastSavedContent);

	// Editable title
	let docTitle = $state(untrack(() => data.document?.title ?? ''));
	let editingTitle = $state(false);
	let titleError = $state('');
	let titleInputEl = $state<HTMLInputElement | null>(null);

	function startEditTitle() {
		editingTitle = true;
		titleError = '';
		setTimeout(() => titleInputEl?.select(), 0);
	}

	async function commitTitle() {
		const trimmed = docTitle.trim();
		if (!trimmed || trimmed === data.document?.title) {
			editingTitle = false;
			docTitle = data.document?.title ?? '';
			return;
		}
		try {
			await trpc.documents.update.mutate({ id: data.document!.id, title: trimmed });
			data.document!.title = trimmed;
			editingTitle = false;
			titleError = '';
		} catch (e: unknown) {
			titleError = e instanceof Error ? e.message : 'Could not rename document.';
		}
	}

	function onTitleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			commitTitle();
		}
		if (e.key === 'Escape') {
			editingTitle = false;
			docTitle = data.document?.title ?? '';
			titleError = '';
		}
	}
	let writerLostContent = $state<string | null>(null);

	// ── 1 writer / N readers ─────────────────────────────────────────────────────
	const isOwner = $derived(isProjectOwner(data.currentUserId, data.projectOwnerId));
	// writerUserId null → owner writes; set → only that user writes (if role still allows it)
	let currentWriterUserId = $state(untrack(() => data.document?.writerUserId ?? null));
	let currentWriterName = $state(untrack(() => data.writerName ?? null));
	const myCollaboratorRole = $derived(
		(data.collaborators.find((c) => c.userId === data.currentUserId)?.role ?? null) as CollaboratorRole | null
	);
	const canWrite = $derived(
		!data.document.isReadonly &&
		canWriteDocument({
			isProjectOwner: isOwner,
			writerUserId: currentWriterUserId,
			currentUserId: data.currentUserId,
			collaboratorRole: myCollaboratorRole
		})
	);


	let delegating = $state(false);

	async function handleSetWriter(userId: string | null) {
		delegating = true;
		try {
			await trpc.documents.setWriter.mutate({ documentId: data.document.id, writerUserId: userId });
			currentWriterUserId = userId;
			currentWriterName = userId === null ? null : (data.collaborators.find((c) => c.userId === userId)?.name ?? userId);
		} catch {
			// ignore
		} finally {
			delegating = false;
		}
	}

	let saveStatus: 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'offline' = $state('idle');

	let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

	// View mode: editor | split | preview
	type ViewMode = 'editor' | 'split' | 'preview';
	const VIEW_MODE_KEY = `view-mode-${data.document?.id ?? ''}`;
	const initialCanWrite = (() => {
		const role = (data.collaborators.find((c) => c.userId === data.currentUserId)?.role ?? null) as CollaboratorRole | null;
		return canWriteDocument({
			isProjectOwner: data.currentUserId === data.projectOwnerId,
			writerUserId: data.document?.writerUserId ?? null,
			currentUserId: data.currentUserId,
			collaboratorRole: role
		});
	})();
	let viewMode = $state<ViewMode>(
		(!initialCanWrite || data.forcePublished)
			? 'preview'
			: (typeof localStorage !== 'undefined'
					? (localStorage.getItem(VIEW_MODE_KEY) as ViewMode | null)
					: null) ?? 'editor'
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
	let showCiteStyleMenu = $state(false);
	let citeStyleMenuPos = $state({ top: 0, left: 0 });
	let citeSearch = $state('');
	let editorEl: {
		insertAtCursor: (text: string) => void;
		getSelection: () => { text: string; from: number; to: number } | null;
		replaceRange: (from: number, to: number, text: string) => void;
		insertMention: (name: string, from: number) => void;
		setGhostText: (text: string | null) => void;
		setSpellHover: (from: number, to: number) => void;
		clearSpellHover: () => void;
	} | null = $state(null);

	type PreviewRef = { scrollToComment: (id: string, paragraphNumber: number | null) => void } | null;
	let previewRef = $state<PreviewRef>(null);
	let splitPreviewRef = $state<PreviewRef>(null);

	function extractDocumentPersons(): string[] {
		const re = /\[\[person:([^\]]+)\]\]/g;
		const seen = new Set<string>();
		let m: RegExpExecArray | null;
		while ((m = re.exec(content)) !== null) seen.add(m[1]);
		return [...seen];
	}

	// Word-level ghost text state
	let ghostWord: { from: number; name: string } | null = $state(null);

	// Heading ghost text state
	let ghostHeading: { from: number; cursorPos: number; title: string } | null = $state(null);

	function onwordprefix(prefix: string, from: number, cursorPos: number) {
		const persons = extractDocumentPersons();
		const matches = persons.filter((n) => n.toLowerCase().startsWith(prefix.toLowerCase()));
		if (matches.length === 0) {
			editorEl?.setGhostText(null);
			ghostWord = null;
			return;
		}

		// Find the match whose last occurrence before cursorPos is closest to cursorPos
		let bestName: string | null = null;
		let bestDist = Infinity;
		for (const name of matches) {
			const token = `[[person:${name}]]`;
			let idx = 0,
				lastBefore = -1;
			while (true) {
				const found = content.indexOf(token, idx);
				if (found === -1 || found >= cursorPos) break;
				lastBefore = found;
				idx = found + 1;
			}
			if (lastBefore !== -1) {
				const dist = cursorPos - lastBefore;
				if (dist < bestDist) {
					bestDist = dist;
					bestName = name;
				}
			}
		}
		if (bestName) {
			ghostWord = { from, name: bestName };
			editorEl?.setGhostText(bestName.slice(prefix.length));
		} else {
			ghostWord = null;
			editorEl?.setGhostText(null);
		}
	}

	function onwordprefixclear() {
		ghostWord = null;
		editorEl?.setGhostText(null);
	}

	function onheadingprefix(partial: string, from: number, cursorPos: number) {
		const headings: string[] = [];
		for (const line of content.split('\n')) {
			const m = line.match(/^#{1,6}\s+(.+)$/);
			if (m) headings.push(m[1].trim());
		}
		const match = headings.find((h) => h.toLowerCase().startsWith(partial.toLowerCase()));
		if (match) {
			ghostHeading = { from, cursorPos, title: match };
			editorEl?.setGhostText(match.slice(partial.length) + ']]');
		} else {
			ghostHeading = null;
			editorEl?.setGhostText(null);
		}
	}

	function onheadingprefixclear() {
		ghostHeading = null;
		editorEl?.setGhostText(null);
	}

	function onheadingghosttab(): boolean {
		if (!ghostHeading || !editorEl) return false;
		const { from, cursorPos, title } = ghostHeading;
		ghostHeading = null;
		editorEl.setGhostText(null);
		editorEl.replaceRange(from, cursorPos, title + ']]');
		return true;
	}

	function onwordghosttab(): boolean {
		if (!ghostWord || !editorEl) return false;
		const { from, name } = ghostWord;
		// 'from' is word start; cursor is somewhere inside the word (the typed prefix).
		// insertMention replaces from..cursor with [[person:Name]], same behaviour as @@ flow.
		const saved = ghostWord;
		ghostWord = null;
		editorEl.setGhostText(null);
		editorEl.insertMention(name, saved.from);
		return true;
	}

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

	function isNoKeyError(e: unknown): boolean {
		return !!(
			e &&
			typeof e === 'object' &&
			'data' in e &&
			(e as { data?: { code?: string } }).data?.code === 'PRECONDITION_FAILED'
		);
	}

	const NO_KEY_MSG = 'No AI key configured. Go to Settings → AI to add one.';

	let lookupUnavailable = $state(false);

	async function lookupNames(partial: string, context: string): Promise<string[]> {
		try {
			const result = await trpc.ai.lookupNames.query({
				partial,
				context,
				projectId: data.document.projectId
			});
			lookupUnavailable = false;
			return result;
		} catch (e: unknown) {
			if (isNoKeyError(e)) lookupUnavailable = true;
			return [];
		}
	}

	async function loadRefs() {
		if (refsLoaded) return;
		try {
			let rows: CiteRef[];
			try {
				rows = (await trpc.references.listWithSubnotes.query(data.document.projectId)) as CiteRef[];
			} catch {
				// Fallback if reference_subnote table not yet migrated
				rows = (await trpc.references.list.query(data.document.projectId)) as CiteRef[];
			}
			projectRefs = rows;
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
		editorEl?.insertAtCursor(`[[@${ref.citeKey}]]`);
		showCitePicker = false;
	}

	// Citation style: localStorage per-document overrides project default, which overrides 'apa'
	$effect(() => {
		if (!data.document) return;
		const stored = localStorage.getItem(`cite-style-${data.document.id}`);
		if (stored && (stored === 'apa' || stored === 'ieee' || stored === 'vancouver' || stored === 'chicago')) {
			citationStyle = stored as CitationStyle;
		} else if (data.projectCitationStyle) {
			citationStyle = data.projectCitationStyle;
		}
	});

	function setCitationStyle(s: CitationStyle) {
		citationStyle = s;
		localStorage.setItem(`cite-style-${data.document.id}`, s);
	}

	// Load refs: always (needed for hover popup) + when preview is opened
	$effect(() => {
		loadRefs();
	});
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
		data.document.type === 'book' ? data.projectDocs.filter((d) => d.type === 'chapter') : []
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

	// Spell check language
	let spellLanguage = $state(untrack(() => data.document?.spellLanguage ?? 'auto'));

	async function setSpellLanguage(lang: string) {
		const prev = spellLanguage;
		spellLanguage = lang;
		try {
			await trpc.documents.update.mutate({
				id: data.document.id,
				spellLanguage: lang === 'auto' ? null : lang
			});
		} catch {
			spellLanguage = prev;
		}
	}

	// ── Spell check panel ───────────────────────────────────────────────────────
	let showSpellPanel = $state(false);
	let spellLoading = $state(false);
	let spellCorrections = $state<SpellCorrection[]>([]);

	async function runSpellCheck(scoped?: { text: string; offset: number }) {
		showSpellPanel = true;
		spellLoading = true;
		spellCorrections = [];
		try {
			const result = await trpc.ai.spellCheck.mutate({
				text: scoped ? scoped.text : content,
				language: spellLanguage,
				projectId: data.document.projectId
			});
			// If scoped, shift all offsets to document positions
			spellCorrections = scoped
				? result.corrections.map((c) => ({ ...c, from: c.from + scoped.offset, to: c.to + scoped.offset }))
				: result.corrections;
		} catch {
			showSpellPanel = false;
		} finally {
			spellLoading = false;
		}
	}

	function applySpellCorrection(correction: SpellCorrection) {
		editorEl?.replaceRange(correction.from, correction.to, correction.suggestion);
	}

	async function ignoreSpellWord(word: string) {
		await trpc.users.addSpellAllowlist.mutate({ word });
	}

	// ── Grammar assistant panel ──────────────────────────────────────────────────
	let showGrammarPanel = $state(false);
	let grammarLoading = $state(false);
	let grammarCorrections = $state<SpellCorrection[]>([]);

	async function runGrammarCheck() {
		showGrammarPanel = true;
		grammarLoading = true;
		grammarCorrections = [];
		try {
			const result = await trpc.ai.grammarCheck.mutate({
				text: content,
				projectId: data.document.projectId
			});
			grammarCorrections = result.corrections;
		} catch {
			showGrammarPanel = false;
		} finally {
			grammarLoading = false;
		}
	}

	function applyGrammarCorrection(correction: SpellCorrection) {
		editorEl?.replaceRange(correction.from, correction.to, correction.suggestion);
	}

	// Markdown cheatsheet
	let showCheatsheet = $state(false);

	// Commit dialog
	let showCommit = $state(false);
	let commitMessage = $state('');

	let committing = $state(false);
	let commitError = $state('');

	// ── Action capabilities ───────────────────────────────────────────────────
	const saveCap = $derived.by(() => getSaveDraftCapability({
		canWrite,
		online: onlineStore.online,
		saving: saveStatus === 'saving'
	}));

	const commitCap = $derived.by(() => getCommitCapability({
		canWrite,
		online: onlineStore.online,
		hasContent: content.trim().length > 0,
		committing
	}));

	const reclaimCap = $derived.by(() => getReclaimWritingCapability({
		isOwner,
		writerUserId: currentWriterUserId
	}));

	const releaseWriterCap = $derived.by(() => getReleaseWriterCapability({
		isCurrentWriter: data.currentUserId === currentWriterUserId,
		canWrite
	}));

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
		paragraphNumber: number | null;
		status: 'open' | 'resolved';
		createdAt: Date;
		replies: Reply[];
	};

	let showComments = $state(false);
	let currentCommentId = $state<string | null>(null);
	let inlineComments: InlineComment[] = $state(
		untrack(() => (data.inlineComments as InlineComment[]) ?? [])
	);

	// Selection → floating "Comentar" button
	type Selection = {
		text: string;
		from: number;
		to: number;
		coords: { top: number; bottom: number; left: number; right: number } | null;
	};
	let currentSelection: Selection | null = $state(null);

	// New comment form (triggered from floating button)
	let showNewComment = $state(false);
	let newCommentText = $state('');
	let submittingComment = $state(false);

	// Citation explain popover
	let citationExplain: {
		citeKey: string;
		ref: CiteRef | null;
		coords: { bottom: number; left: number };
		result: string;
		loading: boolean;
	} | null = $state(null);

	const CITE_SELECTION_RE = /^\[\[@([\w:._-]+)\]\]$/;

	function selectedCiteKey(): string | null {
		if (!currentSelection) return null;
		const m = currentSelection.text.trim().match(CITE_SELECTION_RE);
		return m ? m[1] : null;
	}

	async function explainCitation(citeKey: string, coords: { bottom: number; left: number }) {
		const ref = projectRefs.find((r) => r.citeKey === citeKey);
		const needsAi = hasAiKey && !ref?.readingNotes;
		citationExplain = { citeKey, ref: ref ?? null, coords, result: '', loading: needsAi };
		if (!needsAi) return;
		const surrounding = (() => {
			const pos = currentSelection?.from ?? 0;
			return content.slice(Math.max(0, pos - 400), pos + 400);
		})();
		try {
			const res = await trpc.ai.explainCitation.query({
				projectId: data.document.projectId,
				citeKey,
				refTitle: ref?.title ?? '',
				refAuthors: (ref?.authors ?? [])
					.map((a) => `${a.last}${a.first ? ', ' + a.first : ''}`)
					.join('; '),
				refYear: ref?.year ?? '',
				surrounding
			});
			citationExplain = { ...citationExplain, result: res, loading: false };
		} catch {
			citationExplain = {
				...citationExplain,
				result: 'Could not explain this citation.',
				loading: false
			};
		}
	}

	// Author info popover
	type AuthorInfo = { note: string; photo?: string };
	let authorPopover: {
		name: string;
		coords: { bottom: number; left: number };
		result: AuthorInfo | null;
		loading: boolean;
	} | null = $state(null);

	async function showAuthorInfo(name: string, coords: { bottom: number; left: number }) {
		if (authorPopover?.name === name) return; // already showing
		authorPopover = { name, coords, result: null, loading: true };
		try {
			const res = await trpc.ai.authorInfo.query({ name, projectId: data.document.projectId });
			authorPopover = { ...authorPopover, result: res, loading: false };
		} catch {
			authorPopover = {
				...authorPopover,
				result: { dates: '', field: '', nationality: '', note: 'Could not load info.' },
				loading: false
			};
		}
	}

	// Heading word count tooltip
	let headingTooltip: {
		title: string;
		wordCount: number;
		coords: { bottom: number; left: number };
	} | null = $state(null);

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

		if (!onlineStore.online) {
			await offlineDb.pendingEdits.add({
				id: crypto.randomUUID(),
				documentId: data.document.id,
				content,
				savedAt: new Date(),
				status: 'pending'
			});
			lastSavedContent = content;
			saveStatus = 'offline';
			console.log(`[offline] save: queued to Dexie (doc ${data.document.id})`);
			return;
		}

		saveStatus = 'saving';
		console.log(`[offline] save: saving online (doc ${data.document.id})`);
		try {
			await trpc.documents.saveDraft.mutate({ documentId: data.document.id, content });
			lastSavedContent = content;
			saveStatus = 'saved';
			console.log(`[offline] save: ✓ saved online (doc ${data.document.id})`);
			setTimeout(() => {
				if (saveStatus === 'saved') saveStatus = 'idle';
			}, 2000);
		} catch (e) {
			// Network error (fetch failed, no response) → save to Dexie as offline
			const isNetworkError = e instanceof Error && (
				e.message.includes('fetch') ||
				e.message.includes('network') ||
				e.message.includes('Failed to fetch') ||
				e.message.toLowerCase().includes('networkerror') ||
				('cause' in e && e.cause instanceof TypeError)
			);
			if (isNetworkError) {
				await offlineDb.pendingEdits.add({
					id: crypto.randomUUID(),
					documentId: data.document.id,
					content,
					savedAt: new Date(),
					status: 'pending'
				});
				lastSavedContent = content;
				saveStatus = 'offline';
				onlineStore.online = false; // align state so subsequent saves go directly to Dexie
				console.warn(`[offline] save: network error detected — queued to Dexie (doc ${data.document.id})`);
			} else {
				saveStatus = 'error';
				console.error(`[offline] save: ✗ server error (doc ${data.document.id})`, e);
			}
		}
	}

	// When reconnecting, update local save status once the global sync has pushed our edits.
	// The actual push is handled by connectivity.syncAll() in the layout.
	$effect(() => {
		if (onlineStore.online && saveStatus === 'offline') {
			const documentId = data.document?.id;
			if (!documentId) return;
			console.log(`[offline] reconnect: checking pending edits for doc ${documentId}`);
			offlineDb.pendingEdits
				.where({ documentId })
				.toArray()
				.then((edits) => {
					const hasPending = edits.some((e) => e.status === 'pending');
					const writerLost = edits.find((e) => e.status === 'writer_lost');
					if (writerLost) {
						console.warn(`[offline] reconnect: writer_lost detected for doc ${documentId}`);
						writerLostContent = writerLost.content;
						saveStatus = 'error';
					} else if (!hasPending) {
						console.log(`[offline] reconnect: ✓ all edits synced for doc ${documentId}`);
						saveStatus = 'idle';
					} else {
						console.log(`[offline] reconnect: still ${edits.filter(e => e.status === 'pending').length} pending edit(s) for doc ${documentId}`);
					}
				});
		}
	});

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

	function extractParagraph(md: string, from: number): string {
		// Walk backwards to the previous blank line (paragraph boundary)
		let start = from;
		while (start > 0 && !(md[start - 1] === '\n' && (start < 2 || md[start - 2] === '\n'))) {
			start--;
		}
		// Walk forwards to the next blank line
		let end = from;
		while (end < md.length && !(md[end] === '\n' && end + 1 < md.length && md[end + 1] === '\n')) {
			end++;
		}
		return md.slice(start, end).trim();
	}

	async function submitComment() {
		if (!currentSelection || !newCommentText.trim()) return;
		submittingComment = true;
		try {
			const lineStart = posToLine(content, currentSelection.from);
			const lineEnd = posToLine(content, currentSelection.to);
			const anchorContext = extractParagraph(content, currentSelection.from);
			const created = await trpc.comments.createInline.mutate({
				documentId: data.document.id,
				content: newCommentText.trim(),
				anchorText: currentSelection.text,
				anchorContext: anchorContext || undefined,
				lineStart,
				lineEnd,
				characterStart: currentSelection.from,
				characterEnd: currentSelection.to,
				paragraphNumber: undefined
			});

			const newComment: InlineComment = {
				id: created.id,
				authorId: created.authorId,
				authorName: data.currentUserId === created.authorId ? ((data as any).user?.name ?? '') : '',
				content: created.content,
				anchorText: created.anchorText,
				lineStart: created.lineStart,
				characterStart: created.characterStart,
				characterEnd: created.characterEnd,
				paragraphNumber: null,
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
		currentCommentId = id;
		// Scroll preview to the relevant element
		previewRef?.scrollToComment(id, c.paragraphNumber);
		splitPreviewRef?.scrollToComment(id, c.paragraphNumber);
		// Also scroll editor (only for text-selection comments)
		if (c.paragraphNumber === null) {
			const anchor = findAnchor(content, c.anchorText ?? '', c.characterStart ?? 0);
			if (anchor) scrollToRange = { ...anchor };
		}
	}

	function handleCommentResolved(id: string) {
		inlineComments = inlineComments.map((c) => (c.id === id ? { ...c, status: 'resolved' } : c));
	}

	function handleCommentReopened(id: string) {
		inlineComments = inlineComments.map((c) => (c.id === id ? { ...c, status: 'open' } : c));
	}

	function handleReplyAdded(commentId: string, reply: Reply) {
		inlineComments = inlineComments.map((c) =>
			c.id === commentId ? { ...c, replies: [...c.replies, reply] } : c
		);
	}

	// 'pending' only shows "Unsaved changes" when content has actually diverged from last save.
	// Without this guard, loading a document with an existing draft shows the label
	// while the button is disabled (saveStatus='pending' but isDirty=false).
	const saveStatusLabel = $derived((): string => {
		switch (saveStatus) {
			case 'pending': return isDirty ? 'Unsaved changes' : '';
			case 'saving':  return 'Saving...';
			case 'saved':   return 'Saved';
			case 'error':   return 'Error saving';
			case 'offline': return 'Guardado offline';
			default:        return '';
		}
	});

	const openCommentsCount = $derived(inlineComments.filter((c) => c.status === 'open').length);

	const previewCommentAnchors = $derived(
		inlineComments
			.filter((c) => c.status === 'open' && c.anchorText)
			.map((c) => ({ id: c.id, anchorText: c.anchorText! }))
	);

	const paragraphComments = $derived(
		inlineComments
			.filter((c) => c.status === 'open' && c.paragraphNumber !== null)
			.map((c) => ({ id: c.id, paragraphNumber: c.paragraphNumber! }))
	);

	// Paragraph comment form
	let showNewParagraphComment = $state(false);
	let pendingParagraphNumber = $state<number | null>(null);
	let paragraphCommentPos = $state({ top: 0, right: 0 });
	let paragraphCommentText = $state('');
	let submittingParagraphComment = $state(false);

	function handlePreviewSelection(sel: { text: string; coords: { top: number; bottom: number; left: number; right: number } }) {
		const from = content.indexOf(sel.text);
		const to = from >= 0 ? from + sel.text.length : 0;
		updateSelection({ text: sel.text, from: Math.max(from, 0), to: Math.max(to, 0), coords: sel.coords });
	}

	function handlePreviewCommentClick(id: string) {
		showComments = true;
	}

	function handleParagraphComment(paragraphNumber: number, coords: { top: number; right: number }) {
		pendingParagraphNumber = paragraphNumber;
		paragraphCommentPos = coords;
		paragraphCommentText = '';
		showNewParagraphComment = true;
	}

	async function submitParagraphComment() {
		if (!pendingParagraphNumber || !paragraphCommentText.trim()) return;
		submittingParagraphComment = true;
		try {
			const paragraphText =
				previewRef?.getParagraphText(pendingParagraphNumber) ??
				splitPreviewRef?.getParagraphText(pendingParagraphNumber);
			const created = await trpc.comments.createInline.mutate({
				documentId: data.document.id,
				content: paragraphCommentText.trim(),
				paragraphNumber: pendingParagraphNumber,
				anchorContext: paragraphText || undefined,
				anchorText: undefined,
				lineStart: undefined,
				lineEnd: undefined,
				characterStart: undefined,
				characterEnd: undefined
			});

			const newComment: InlineComment = {
				id: created.id,
				authorId: created.authorId,
				authorName: data.currentUserId === created.authorId ? ((data as any).user?.name ?? '') : '',
				content: created.content,
				anchorText: null,
				lineStart: null,
				characterStart: null,
				characterEnd: null,
				paragraphNumber: created.paragraphNumber,
				status: 'open',
				createdAt: created.createdAt,
				replies: []
			};

			inlineComments = [...inlineComments, newComment];
			paragraphCommentText = '';
			showNewParagraphComment = false;
			pendingParagraphNumber = null;
			showComments = true;
		} finally {
			submittingParagraphComment = false;
		}
	}

	// Export dropdown
	let showExport = $state(false);
	let exportMenuPos = $state({ top: 0, left: 0 });

	// ── AI task model labels (from layout data) ──────────────────────────────────
	const aiTaskConfig = $derived(data.aiTaskConfig ?? {});
	const hasAiKey = $derived(data.hasAiKey ?? false);
	const aiCtaType = $derived(
		hasAiKey ? 'ok' :
		!data.projectOrgId ? 'personal' :
		(data.orgs ?? []).find((o) => o.id === data.projectOrgId)?.role === 'owner' ? 'org-owner' : 'org-member'
	);
	function taskModel(task: 'agent' | 'draft' | 'review') {
		const modelId = aiTaskConfig[task]?.model;
		return modelId ? (MODEL_SHORT_LABEL[modelId] ?? modelId.split('/').pop() ?? '') : null;
	}

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
	let reviewQuestions = $state<string[] | null>(null);
	let loadingQuestions = $state(false);
	let questionsError = $state('');

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
			reviewError = isNoKeyError(e)
				? NO_KEY_MSG
				: e instanceof Error
					? e.message
					: 'Error reviewing document.';
		} finally {
			loadingReview = false;
		}
	}

	async function runReviewQuestions() {
		if (loadingQuestions) return;
		loadingQuestions = true;
		questionsError = '';
		reviewQuestions = null;
		try {
			reviewQuestions = await trpc.ai.generateReviewQuestions.mutate({
				projectId: data.document.projectId,
				documentId: data.document.id
			});
		} catch (e: unknown) {
			questionsError = isNoKeyError(e)
				? NO_KEY_MSG
				: e instanceof Error
					? e.message
					: 'Error generating questions.';
		} finally {
			loadingQuestions = false;
		}
	}

	// ── Enrich (find untagged) ───────────────────────────────────────────────────
	type UntaggedResult = {
		persons: string[];
		refs: { context: string; text: string; citeKey: string }[];
	};
	let showEnrich = $state(false);
	let loadingEnrich = $state(false);
	let enrichResult = $state<UntaggedResult | null>(null);
	let enrichError = $state('');

	function toggleEnrich() {
		showEnrich = !showEnrich;
		if (showEnrich) {
			showChat = false;
			showReview = false;
			showDraft = false;
			showHistory = false;
			showComments = false;
		}
	}

	async function runEnrich() {
		if (loadingEnrich) return;
		loadingEnrich = true;
		enrichError = '';
		enrichResult = null;
		try {
			enrichResult = await trpc.ai.findUntagged.mutate({
				projectId: data.document.projectId,
				documentId: data.document.id
			});
		} catch (e: unknown) {
			enrichError = isNoKeyError(e)
				? NO_KEY_MSG
				: e instanceof Error
					? e.message
					: 'Error analysing document.';
		} finally {
			loadingEnrich = false;
		}
	}

	function enrichSnippet(term: string): { before: string; match: string; after: string } | null {
		const idx = content.indexOf(term);
		if (idx === -1) return null;
		const start = Math.max(0, idx - 50);
		const end = Math.min(content.length, idx + term.length + 50);
		return {
			before: (start > 0 ? '…' : '') + content.slice(start, idx),
			match: term,
			after: content.slice(idx + term.length, end) + (end < content.length ? '…' : '')
		};
	}

	function applyPerson(name: string) {
		const token = `[[person:${name}]]`;
		// Replace all occurrences of the bare name not already inside [[person:...]]
		const re = new RegExp(
			`(?<!\\[\\[person:)\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b(?![^\\[]*\\]\\])`,
			'g'
		);
		content = content.replace(re, token);
		enrichResult = enrichResult
			? { ...enrichResult, persons: enrichResult.persons.filter((p) => p !== name) }
			: null;
	}

	function applyRef(context: string, text: string, citeKey: string) {
		// Use context as anchor to find the exact occurrence, then replace only `text` within it
		const ctxIdx = content.indexOf(context);
		if (ctxIdx !== -1) {
			const textIdx = content.indexOf(text, ctxIdx);
			if (textIdx !== -1 && textIdx < ctxIdx + context.length) {
				content =
					content.slice(0, textIdx) + `[[@${citeKey}]]` + content.slice(textIdx + text.length);
			}
		} else {
			// fallback: plain replace if context not found
			content = content.replace(text, `[[@${citeKey}]]`);
		}
		enrichResult = enrichResult
			? { ...enrichResult, refs: enrichResult.refs.filter((r) => r.text !== text) }
			: null;
	}

	function applyAll() {
		if (!enrichResult) return;
		enrichResult.persons.forEach(applyPerson);
		enrichResult.refs.forEach((r) => applyRef(r.context, r.text, r.citeKey));
	}

	// ── Draft assistant ──────────────────────────────────────────────────────────
	let showDraft = $state(false);
	let draftMode = $state<'new' | 'rewrite'>('new');
	let draftInstruction = $state('');
	let draftResult = $state('');
	let loadingDraft = $state(false);
	let draftError = $state('');

	// Selection AI review
	type ReviewType = 'clarity' | 'argument' | 'citations' | 'terminology';
	type SelectionReview = {
		from: number;
		to: number;
		coords: { bottom: number; left: number };
		reviewType: ReviewType;
		loading: boolean;
		suggestion: string;
		explanation: string;
	} | null;
	let selectionReview = $state<SelectionReview>(null);
	let showReviewTypeMenu = $state(false);

	const reviewTypeLabels: Record<ReviewType, string> = {
		clarity: 'Clarity',
		argument: 'Argument',
		citations: 'Missing citations',
		terminology: 'Terminology'
	};


	function extractHeadings(text: string): string[] {
		return [...text.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => m[1].trim());
	}

	async function runReviewSelection(reviewType: ReviewType) {
		if (!currentSelection) return;
		showReviewTypeMenu = false;
		const { text, from, to, coords } = currentSelection;
		selectionReview = {
			from,
			to,
			coords: coords ? { bottom: coords.bottom, left: coords.left } : { bottom: 0, left: 0 },
			reviewType,
			loading: true,
			suggestion: '',
			explanation: ''
		};
		try {
			const before = content.slice(Math.max(0, from - 300), from);
			const after = content.slice(to, to + 300);
			const headings = extractHeadings(content);
			const res = await trpc.ai.reviewSelection.mutate({
				projectId: data.document.projectId,
				selection: text,
				before,
				after,
				headings,
				docTitle: data.document.title,
				reviewType
			});
			selectionReview = {
				...selectionReview!,
				loading: false,
				suggestion: res.suggestion,
				explanation: res.explanation
			};
		} catch (e) {
			selectionReview = null;
		}
	}

	function acceptSelectionReview() {
		if (!selectionReview || selectionReview.loading) return;
		editorEl?.replaceRange(selectionReview.from, selectionReview.to, selectionReview.suggestion);
		selectionReview = null;
		currentSelection = null;
	}

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
			draftError = isNoKeyError(e)
				? NO_KEY_MSG
				: e instanceof Error
					? e.message
					: 'Error generating draft.';
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

	// Show floating button only after selection stabilizes (not during drag)
	let showFloating = $state(false);
	let floatingDebounce: ReturnType<typeof setTimeout> | null = null;

	function updateSelection(sel: typeof currentSelection) {
		currentSelection = sel;
		if (!sel) {
			showNewComment = false;
			showReviewTypeMenu = false;
			showFloating = false;
			if (floatingDebounce) {
				clearTimeout(floatingDebounce);
				floatingDebounce = null;
			}
		} else {
			if (floatingDebounce) clearTimeout(floatingDebounce);
			floatingDebounce = setTimeout(() => {
				showFloating = true;
			}, 150);
		}
	}

	function onDocKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && authorPopover) {
			authorPopover = null;
			e.stopPropagation();
		}
	}

	$effect(() => {
		document.addEventListener('keydown', onDocKeydown);
		return () => document.removeEventListener('keydown', onDocKeydown);
	});

	// Guard: unsaved changes — SvelteKit client-side navigation
	// Capture workspace at page entry so we can restore it if the user cancels.
	const entryWorkspace = { ...workspaceStore.current };
	beforeNavigate(({ cancel }) => {
		if (isDirty) {
			const ok = confirm('You have unsaved changes. Leave anyway?');
			if (!ok) {
				cancel();
				workspaceStore.set(entryWorkspace);
			} else {
				// Save to Dexie before leaving so content survives navigation
				offlineDb.pendingEdits.add({
					id: crypto.randomUUID(),
					documentId: data.document.id,
					content,
					savedAt: new Date(),
					status: 'pending'
				});
			}
		}
	});

	// Guard: tab close / hard refresh
	$effect(() => {
		const handler = (e: BeforeUnloadEvent) => {
			if (isDirty) e.preventDefault();
		};
		window.addEventListener('beforeunload', handler);
		return () => window.removeEventListener('beforeunload', handler);
	});

	onDestroy(() => {
		if (autoSaveTimer) clearTimeout(autoSaveTimer);
		if (floatingDebounce) clearTimeout(floatingDebounce);
	});

	onMount(() => {
		offlineDb.offlineIndex.put({
			url: `/projects/${data.document.projectId}/documents/${data.document.id}`,
			title: data.document.title,
			type: 'document',
			projectId: data.document.projectId,
			visitedAt: new Date(),
			content: content ?? ''
		});

		const targetId = page.url.searchParams.get('commentId');
		if (!targetId) return;
		currentCommentId = targetId;
		showComments = true;
		if (viewMode === 'editor') setViewMode('preview');
		// Scroll preview and sidebar after DOM renders
		setTimeout(() => {
			const c = inlineComments.find((x) => x.id === targetId);
			if (c) {
				(previewRef ?? splitPreviewRef)?.scrollToComment(targetId, c.paragraphNumber ?? null);
			}
			document
				.querySelector(`[data-comment-id="${CSS.escape(targetId)}"]`)
				?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		}, 150);
	});

	// Scroll sidebar to current comment whenever it changes
	$effect(() => {
		const id = currentCommentId;
		if (!id || !showComments) return;
		Promise.resolve().then(() => {
			document
				.querySelector(`[data-comment-id="${CSS.escape(id)}"]`)
				?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		});
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
				<div
					class="flex shrink-0 items-center gap-3 border-b border-paper-border bg-paper/95 px-4 py-3 backdrop-blur-sm dark:border-dark-paper-border dark:bg-dark-paper/95"
				>
					<button
						onclick={() => {
							window.location.href = `/projects/${data.document.projectId}`;
						}}
						class="flex items-center gap-1.5 font-sans text-sm text-ink-muted dark:text-dark-ink-muted"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="M15 18l-6-6 6-6" />
						</svg>
						{data.projectTitle}
					</button>
					<span class="text-ink-faint dark:text-dark-ink-faint">/</span>
					<span class="truncate font-sans text-sm font-medium text-ink dark:text-dark-ink"
						>{data.document.title}</span
					>
				</div>
				<div class="pb-safe flex-1 overflow-y-auto px-4 py-6">
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
			class="sticky top-0 z-10 flex flex-col border-b border-paper-border bg-paper/95 backdrop-blur-sm dark:border-dark-paper-border dark:bg-dark-paper/95"
		>
			<!-- Row 1: breadcrumb -->
			<div class="flex min-w-0 items-center gap-2 border-b border-paper-border/50 px-6 py-2 font-sans text-sm dark:border-dark-paper-border/50">
				<button
					onclick={() => (window.location.href = `/projects/${data.document.projectId}`)}
					class="shrink-0 text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
				>
					{data.projectTitle}
				</button>
				<span class="text-ink-faint dark:text-dark-ink-faint">/</span>
				<span class="truncate font-medium text-ink dark:text-dark-ink">{docTitle}</span>

				<!-- Writer badge -->
				{#if currentWriterUserId !== null}
					<span
						class="shrink-0 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 font-sans text-[10px] text-amber-700 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-400"
					>
						Writer: {currentWriterName ?? currentWriterUserId}
					</span>
				{/if}
				{#if !canWrite}
					<span
						class="shrink-0 rounded border border-paper-border bg-paper-ui px-1.5 py-0.5 font-sans text-[10px] text-ink-faint dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink-faint"
					>
						Read-only
					</span>
				{/if}
				{#if data.document.isReadonly && isOwner}
					<button
						type="button"
						onclick={async () => {
							await trpc.documents.update.mutate({ id: data.document.id, isReadonly: false });
							data.document = { ...data.document, isReadonly: false };
						}}
						class="shrink-0 font-sans text-[10px] text-accent hover:underline"
					>
						Unlock editing
					</button>
				{/if}

				<!-- Save status (right-aligned) -->
				{#if saveStatusLabel()}
					<span
						class="ml-auto shrink-0 font-sans text-xs {saveStatus === 'error'
							? 'text-red-500'
							: saveStatus === 'saved'
								? 'text-green-600'
								: 'text-ink-faint dark:text-dark-ink-faint'}"
					>
						{saveStatusLabel()}
					</span>
				{/if}
			</div>

			<!-- Row 2: toolbar -->
			<div class="flex items-center gap-2 overflow-x-auto px-4 py-2">

				<!-- Reclaim writer (Delegate moved to project doc list) -->
				{#if reclaimCap.kind === 'available'}
					<button
						onclick={() => handleSetWriter(null)}
						disabled={delegating}
						title="Reclaim write access from {currentWriterName ?? currentWriterUserId}"
						class="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 font-sans text-sm text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-40 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/40"
					>
						Reclaim
					</button>
				{/if}

				<!-- Release writer (downgraded writer yields their slot back to project owner) -->
				{#if releaseWriterCap.kind === 'available'}
					<button
						onclick={() => handleSetWriter(null)}
						disabled={delegating}
						title="Release write access — the project owner will regain control"
						class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui disabled:opacity-40 dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
					>
						Release writer
					</button>
				{/if}

				<button
					onclick={doSaveDraft}
					disabled={!isDirty || !canTriggerSave(saveCap)}
					title={saveCap.kind === 'queued' ? saveCap.hint : saveCap.kind === 'blocked' ? saveCap.reason : undefined}
					class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui disabled:opacity-40 dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
				>
					{saveCap.kind === 'saving' ? 'Saving…' : saveCap.kind === 'queued' ? 'Save offline' : 'Save'}
				</button>

				{#if data.document.type === 'book'}
					<a
						href="/projects/{data.document.projectId}/documents/{data.document.id}/read"
						class="flex items-center gap-1.5 rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
					>
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
							<path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
						</svg>
						Read
					</a>
				{/if}

				<!-- AI buttons or CTA -->
				{#if aiCtaType === 'ok'}
				<!-- Chat assistant button -->
				<button
					type="button"
					onclick={toggleChat}
					title="Chat with the assistant about this document"
					class="flex items-center gap-1.5 rounded-md px-3 py-1.5 font-sans text-sm font-medium transition-colors {showChat
						? 'bg-accent/20 text-accent hover:bg-accent/30 dark:bg-accent/30 dark:hover:bg-accent/40'
						: 'bg-accent/10 text-accent hover:bg-accent/20 dark:bg-accent/20 dark:hover:bg-accent/30'}"
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
				</button>

				<!-- Review button -->
				<button
					type="button"
					onclick={toggleReview}
					title="Review document against project requirements"
					class="flex flex-col items-center rounded-md border px-3 py-1 font-sans text-sm transition-colors {showReview
						? 'border-accent bg-accent/10 text-accent dark:border-accent dark:text-accent'
						: 'border-paper-border text-ink-muted hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui'}"
				>
					<span class="flex items-center gap-1.5">
						<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path
								d="M9 11l3 3L22 4"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
							<path
								d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
						Review
					</span>
					{#if taskModel('review')}
						<span class="text-[10px] opacity-50">{taskModel('review')}</span>
					{/if}
				</button>

				<!-- Draft assistant button -->
				{#if viewMode !== 'preview'}
					<button
						type="button"
						onclick={toggleDraft}
						title="Draft assistant — generate text from your project context"
						class="flex flex-col items-center rounded-md border px-3 py-1 font-sans text-sm transition-colors {showDraft
							? 'border-accent bg-accent/10 text-accent dark:border-accent dark:text-accent'
							: 'border-paper-border text-ink-muted hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui'}"
					>
						<span class="flex items-center gap-1.5">
							<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<path
									d="M12 19l7-7 3 3-7 7-3-3z"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
								<path
									d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
							Draft
						</span>
						{#if taskModel('draft')}
							<span class="text-[10px] opacity-50">{taskModel('draft')}</span>
						{/if}
					</button>
				{/if}

				<!-- Enrich button -->
				<button
					type="button"
					onclick={toggleEnrich}
					title="Find untagged persons and informal citations"
					class="flex flex-col items-center rounded-md border px-3 py-1.5 font-sans text-sm transition-colors {showEnrich
						? 'border-accent/40 bg-accent/5 text-accent dark:border-accent/30'
						: 'border-paper-border text-ink-muted hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui'}"
				>
					<span class="flex items-center gap-1.5">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="1.5" />
							<path
								d="M21 21l-4.35-4.35M11 8v6M8 11h6"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
							/>
						</svg>
						Enrich
					</span>
				</button>

				{:else if aiCtaType === 'personal'}
				<a
					href="/settings?tab=ai"
					class="flex items-center gap-1.5 rounded-md border border-dashed border-accent/40 px-3 py-1.5 font-sans text-xs font-medium text-accent transition-colors hover:border-accent hover:bg-accent/5"
				>
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
					</svg>
					Configure AI
				</a>

				{:else if aiCtaType === 'org-owner'}
				<a
					href="/settings?tab=organizations"
					class="flex items-center gap-1.5 rounded-md border border-dashed border-accent/40 px-3 py-1.5 font-sans text-xs font-medium text-accent transition-colors hover:border-accent hover:bg-accent/5"
				>
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
					</svg>
					Configure org AI
				</a>

				{:else}
				<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
					AI not configured · contact your org owner
				</span>
				{/if}

				<!-- Citation style selector (all modes) -->
				<button
					onclick={(e) => {
						e.stopPropagation();
						const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
						citeStyleMenuPos = { top: rect.bottom + 4, left: rect.left };
						showCiteStyleMenu = !showCiteStyleMenu;
					}}
					class="flex items-center gap-1 rounded-md border border-paper-border px-2.5 py-1.5 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
				>
					{CITATION_STYLE_LABELS[citationStyle]}
					<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
				</button>

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

				<!-- View mode selector (hidden for non-writers and published view) -->
				{#if canWrite && !data.forcePublished}
				<div
					class="flex overflow-hidden rounded-md border border-paper-border dark:border-dark-paper-border"
					role="group"
					aria-label="Modo de vista"
				>
					<button
						onclick={() => setViewMode('editor')}
						title="Solo editor"
						class="px-2.5 py-1.5 transition-colors {viewMode === 'editor'
							? 'bg-accent text-white'
							: 'text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui'}"
						aria-pressed={viewMode === 'editor'}
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path
								d="M4 6h16M4 10h10M4 14h12M4 18h8"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
							/>
						</svg>
					</button>
					<button
						onclick={() => setViewMode('split')}
						title="Editor y vista previa"
						class="border-x border-paper-border px-2.5 py-1.5 transition-colors dark:border-dark-paper-border {viewMode ===
						'split'
							? 'bg-accent text-white'
							: 'text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui'}"
						aria-pressed={viewMode === 'split'}
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<rect
								x="2"
								y="3"
								width="9"
								height="18"
								rx="1"
								stroke="currentColor"
								stroke-width="1.5"
							/>
							<rect
								x="13"
								y="3"
								width="9"
								height="18"
								rx="1"
								stroke="currentColor"
								stroke-width="1.5"
							/>
						</svg>
					</button>
					<button
						onclick={() => setViewMode('preview')}
						title="Solo vista previa"
						class="px-2.5 py-1.5 transition-colors {viewMode === 'preview'
							? 'bg-accent text-white'
							: 'text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui'}"
						aria-pressed={viewMode === 'preview'}
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path
								d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"
								stroke="currentColor"
								stroke-width="1.5"
							/>
							<circle cx="12" cy="12" r="2.5" stroke="currentColor" stroke-width="1.5" />
						</svg>
					</button>
				</div>
				{/if}

				<a
					href="/projects/{data.document.projectId}/documents/{data.document.id}/history"
					class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
				>
					History
				</a>

				<a
					href="/help"
					target="_blank"
					rel="noopener noreferrer"
					title="Syntax guide"
					class="flex h-7 w-7 items-center justify-center rounded-full border border-paper-border font-sans text-sm text-ink-faint transition-colors hover:border-ink-muted hover:text-ink-muted dark:border-dark-paper-border dark:text-dark-ink-faint dark:hover:border-dark-ink-muted dark:hover:text-dark-ink-muted"
				>
					?
				</a>

				<!-- Spell check button -->
				<button
					onclick={() => runSpellCheck()}
					disabled={spellLoading}
					title="Check spelling and grammar"
					class="rounded-md border px-3 py-1.5 font-sans text-sm transition-colors {showSpellPanel
						? 'border-accent bg-accent text-white'
						: 'border-paper-border text-ink-muted hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui'} disabled:opacity-40"
				>
					{spellLoading ? 'Checking…' : 'Spell'}
				</button>

				<!-- Grammar assistant button -->
				<button
					onclick={() => runGrammarCheck()}
					disabled={grammarLoading}
					title="Grammar and style suggestions for non-native English writers"
					class="rounded-md border px-3 py-1.5 font-sans text-sm transition-colors {showGrammarPanel
						? 'border-accent bg-accent text-white'
						: 'border-paper-border text-ink-muted hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui'} disabled:opacity-40"
				>
					{grammarLoading ? 'Checking…' : 'Grammar'}
				</button>

				<!-- Spell language selector -->
				<div
					class="flex items-center gap-1 rounded-md border border-paper-border px-2 py-1.5 dark:border-dark-paper-border"
				>
					<select
						value={spellLanguage}
						onchange={(e) => setSpellLanguage((e.target as HTMLSelectElement).value)}
						title="Spell check language"
						class="cursor-pointer bg-paper font-sans text-sm text-ink-muted outline-none dark:bg-dark-paper dark:text-dark-ink-muted"
					>
						{#each SPELL_LANGUAGES as lang}
							<option value={lang.code}>{lang.label}</option>
						{/each}
					</select>
				</div>

				<!-- Export dropdown trigger only — menu rendered at root level to escape backdrop-filter -->
				<button
					onclick={(e) => {
						const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
						exportMenuPos = { top: rect.bottom + 4, left: rect.left };
						showExport = !showExport;
					}}
					class="flex items-center gap-1 rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
				>
					Export
					<svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
						<path d="M2 3.5l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				</button>

				<button
					onclick={togglePublic}
					title={isPublic
						? 'Public document — visible to everyone as AI context. Click to make private.'
						: 'Private document. Click to make public.'}
					class="flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-sans text-sm transition-colors {isPublic
						? 'border-green-400/60 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-500/40 dark:bg-green-950/30 dark:text-green-400'
						: 'border-paper-border text-ink-muted hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui'}"
				>
					{#if isPublic}
						<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5" />
							<path
								d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
							/>
						</svg>
						Public
					{:else}
						<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<rect
								x="3"
								y="11"
								width="18"
								height="11"
								rx="2"
								stroke="currentColor"
								stroke-width="1.5"
							/>
							<path
								d="M7 11V7a5 5 0 0110 0v4"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
							/>
						</svg>
						Privado
					{/if}
				</button>

				<button
					onclick={() => (showCommit = true)}
					disabled={!canTriggerCommit(commitCap)}
					title={commitCap.kind === 'blocked' ? commitCap.reason : undefined}
					class="rounded-md bg-accent px-3 py-1.5 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
				>
					Commit
				</button>
			</div>
		</div>

		{#snippet editableTitle()}
			<div class="mb-6">
				{#if editingTitle}
					<input
						bind:this={titleInputEl}
						bind:value={docTitle}
						onblur={commitTitle}
						onkeydown={onTitleKeydown}
						class="w-full border-none bg-transparent font-serif text-3xl font-semibold text-ink outline-none dark:text-dark-ink"
					/>
					{#if titleError}
						<p class="mt-1 font-sans text-xs text-red-500">{titleError}</p>
					{/if}
				{:else}
					<button
						type="button"
						onclick={startEditTitle}
						aria-label="Edit document title"
						class="cursor-text text-left font-serif text-3xl font-semibold text-ink dark:text-dark-ink"
					>
						{docTitle}
					</button>
				{/if}
				{#if data.document?.generatedByAi}
					<div
						class="mt-2 inline-flex items-center gap-1.5 rounded border border-paper-border px-2 py-1 dark:border-dark-paper-border"
					>
						<svg
							width="11"
							height="11"
							viewBox="0 0 24 24"
							fill="none"
							aria-hidden="true"
							class="text-ink-faint dark:text-dark-ink-faint"
						>
							<path
								d="M12 2L9.5 9.5L2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5L12 2z"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linejoin="round"
							/>
						</svg>
						<span class="font-sans text-[10px] text-ink-faint dark:text-dark-ink-faint"
							>Generated by AI</span
						>
					</div>
				{/if}
			</div>
		{/snippet}

		<!-- Main layout -->
		<div class="flex h-full overflow-hidden">
			{#if viewMode === 'split'}
				<!-- Split: editor left, preview right -->
				<div class="relative flex flex-1 flex-col overflow-hidden">
					<div class="border-b border-paper-border px-6 pt-10 pb-4 dark:border-dark-paper-border">
						<div class="mx-auto w-full max-w-4xl">
							{@render editableTitle()}
						</div>
					</div>
					<div class="flex flex-1 overflow-hidden">
						<div
							class="flex-1 overflow-y-auto border-r border-paper-border px-6 py-6 dark:border-dark-paper-border"
						>
							<div class="mx-auto w-full max-w-2xl">
								<MarkdownEditor
									bind:this={editorEl}
									bind:value={content}
									references={projectRefs}
									{chapters}
									readonly={!canWrite}
									projectId={data.document.projectId}
									ondocchange={handleDocChange}
									onselectionchange={updateSelection}
									oncitehover={(key, coords) => explainCitation(key, coords)}
									oncitehoverclear={() => (citationExplain = null)}
									onauthorhover={hasAiKey
										? (name, coords) => showAuthorInfo(name, coords)
										: undefined}
									onheadinghover={(info, coords) => {
										headingTooltip = { title: info.title, wordCount: info.wordCount, coords };
									}}
									{commentRanges}
									{scrollToRange}
									onlookup={lookupNames}
									{onwordprefix}
									{onwordprefixclear}
									{onwordghosttab}
									{onheadingprefix}
									{onheadingprefixclear}
									{onheadingghosttab}
									showLookupHint={lookupUnavailable}
									{spellLanguage}
								/>
							</div>
						</div>
						<div class="flex-1 overflow-y-auto px-6 py-6">
							<div class="mx-auto w-full max-w-2xl">
								<MarkdownPreview
									bind:this={splitPreviewRef}
									{content}
									projectId={data.document.projectId}
									references={projectRefs}
									{citationStyle}
									docMap={docMap()}
									commentAnchors={previewCommentAnchors}
									oncommentclick={handlePreviewCommentClick}
									onselection={handlePreviewSelection}
									{paragraphComments}
									onparagraphcomment={handleParagraphComment}
								/>
							</div>
						</div>
					</div>
				</div>
			{:else}
				<!-- Editor / Preview (single panel) -->
				<div class="relative flex-1 overflow-y-auto px-6 py-10">
					<div class="mx-auto w-full max-w-2xl">
						{@render editableTitle()}
						{#if viewMode === 'preview'}
							{#if data.document?.lastCommit}
								<p class="mb-6 -mt-4 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
									{#if data.document.lastCommit.committerName}
										{data.document.lastCommit.committerName} ·
									{/if}
									{new Date(data.document.lastCommit.committedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
								</p>
							{/if}
							{#if data.unpublished}
								<p class="font-sans text-sm text-ink-faint dark:text-dark-ink-faint">
									El autor aún no ha publicado este documento.
								</p>
							{:else}
								<MarkdownPreview
									bind:this={previewRef}
									{content}
									projectId={data.document.projectId}
									references={projectRefs}
									{citationStyle}
									docMap={docMap()}
									commentAnchors={previewCommentAnchors}
									oncommentclick={handlePreviewCommentClick}
									onselection={handlePreviewSelection}
									{paragraphComments}
									onparagraphcomment={handleParagraphComment}
								/>
							{/if}
						{:else}
							<MarkdownEditor
								bind:this={editorEl}
								bind:value={content}
								references={projectRefs}
								{chapters}
								readonly={!canWrite}
								projectId={data.document.projectId}
								ondocchange={handleDocChange}
								onselectionchange={updateSelection}
								{commentRanges}
								{scrollToRange}
								onlookup={lookupNames}
								{onwordprefix}
								{onwordprefixclear}
								{onwordghosttab}
								{onheadingprefix}
								{onheadingprefixclear}
								{onheadingghosttab}
								showLookupHint={lookupUnavailable}
								{spellLanguage}
							/>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Floating action buttons on selection -->
			{#if showFloating && currentSelection && currentSelection.coords && !showNewComment && !citationExplain}
				<div
					class="pointer-events-none fixed z-20 flex gap-1.5"
					style="top: {currentSelection.coords.bottom + 8}px; left: {currentSelection.coords
						.left}px;"
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
					{#if selectedCiteKey() && hasAiKey}
						<button
							class="pointer-events-auto rounded-md bg-accent px-3 py-1.5 font-sans text-xs font-semibold text-white shadow-md transition-colors hover:bg-accent-hover"
							onclick={() => {
								const key = selectedCiteKey()!;
								const coords = currentSelection!.coords!;
								explainCitation(key, coords);
							}}
						>
							Explain citation
						</button>
					{/if}
					{#if hasAiKey && currentSelection && currentSelection.text.trim().length > 20}
						<div class="pointer-events-auto relative">
							<button
								class="hover:bg-paper-muted dark:hover:bg-dark-paper-muted rounded-md border border-paper-border bg-paper px-3 py-1.5 font-sans text-xs font-semibold text-ink shadow-md transition-colors dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
								onclick={() => (showReviewTypeMenu = !showReviewTypeMenu)}
							>
								Review ▾
							</button>
							{#if showReviewTypeMenu}
								<div
									class="absolute top-full left-0 z-30 mt-1 w-44 rounded-md border border-paper-border bg-paper shadow-lg dark:border-dark-paper-border dark:bg-dark-paper"
								>
									{#each Object.entries(reviewTypeLabels) as [type, label]}
										<button
											class="hover:bg-paper-muted dark:hover:bg-dark-paper-muted block w-full px-3 py-2 text-left font-sans text-xs text-ink dark:text-dark-ink"
											onclick={() => runReviewSelection(type as ReviewType)}
										>
											{label}
										</button>
									{/each}
								</div>
							{/if}
						</div>
						<button
							class="pointer-events-auto hover:bg-paper-muted dark:hover:bg-dark-paper-muted rounded-md border border-paper-border bg-paper px-3 py-1.5 font-sans text-xs font-semibold text-ink shadow-md transition-colors dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
							onclick={() => {
								const sel = currentSelection!;
								showFloating = false;
								runSpellCheck({ text: sel.text, offset: sel.from });
							}}
						>
							Spell
						</button>
					{/if}
				</div>
			{/if}

			<!-- Citation explain popover -->
			{#if citationExplain && citationExplain.coords}
				<div
					class="pointer-events-none fixed z-20"
					style="top: {citationExplain.coords.bottom + 8}px; left: {citationExplain.coords.left}px;"
				>
					<div
						class="pointer-events-auto w-80 rounded-lg border border-paper-border bg-paper shadow-lg dark:border-dark-paper-border dark:bg-dark-paper"
					>
						<div
							class="flex items-center justify-between border-b border-paper-border px-3 py-2 dark:border-dark-paper-border"
						>
							<span class="font-mono text-xs font-semibold text-ink-muted dark:text-dark-ink-muted"
								>@{citationExplain.citeKey}</span
							>
							<button
								onclick={() => (citationExplain = null)}
								class="text-ink-faint transition-colors hover:text-ink dark:text-dark-ink-faint dark:hover:text-dark-ink"
								aria-label="Close"
							>
								<svg
									width="12"
									height="12"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"><path d="M18 6L6 18M6 6l12 12" /></svg
								>
							</button>
						</div>

						<!-- Bibliographic data -->
						{#if citationExplain.ref}
							{@const ref = citationExplain.ref}
							<div class="px-3 py-2.5">
								<p class="font-sans text-sm leading-snug font-medium text-ink dark:text-dark-ink">
									{ref.title}
								</p>
								{#if ref.authors?.length}
									<p class="mt-1 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
										{ref.authors
											.map((a) => `${a.last}${a.first ? ', ' + a.first : ''}`)
											.join(' · ')}
									</p>
								{/if}
								<div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
									{#if ref.year}
										<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint"
											>{ref.year}</span
										>
									{/if}
									{#if ref.journal}
										<span class="font-sans text-xs text-ink-faint italic dark:text-dark-ink-faint"
											>{ref.journal}</span
										>
									{:else if ref.publisher}
										<span class="font-sans text-xs text-ink-faint italic dark:text-dark-ink-faint"
											>{ref.publisher}</span
										>
									{:else if ref.booktitle}
										<span class="font-sans text-xs text-ink-faint italic dark:text-dark-ink-faint"
											>{ref.booktitle}</span
										>
									{/if}
								</div>
								{#if ref.doi}
									<a
										href="https://doi.org/{ref.doi}"
										target="_blank"
										rel="noopener noreferrer"
										class="mt-1.5 block font-sans text-[10px] text-accent underline decoration-dotted hover:opacity-80"
									>
										doi:{ref.doi}
									</a>
								{/if}
								<button
									onclick={() => {
										const formatted = formatFullCitation(citationExplain!.ref!, citationStyle, 1);
										navigator.clipboard.writeText(formatted).catch(() => {});
									}}
									class="mt-2 font-sans text-[10px] text-ink-faint underline decoration-dotted transition-colors hover:text-ink dark:text-dark-ink-faint dark:hover:text-dark-ink"
								>
									Copy {citationStyle.toUpperCase()} citation
								</button>
							</div>
						{:else}
							<div class="px-3 py-2.5">
								<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
									Reference not found in project bibliography.
								</p>
							</div>
						{/if}

						<!-- Reading notes (own) or AI explanation (fallback) -->
						{#if citationExplain.ref?.readingNotes}
							<div class="border-t border-paper-border px-3 py-2.5 dark:border-dark-paper-border">
								<p
									class="mb-1 font-sans text-[10px] font-semibold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint"
								>
									My notes
								</p>
								<p class="font-sans text-xs leading-relaxed text-ink dark:text-dark-ink">
									{citationExplain.ref.readingNotes}
								</p>
							</div>
						{:else if hasAiKey && (citationExplain.loading || citationExplain.result)}
							<div class="border-t border-paper-border px-3 py-2.5 dark:border-dark-paper-border">
								{#if citationExplain.loading}
									<div class="flex items-center gap-2">
										<Spinner size="sm" class="text-accent" />
										<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint"
											>Explaining in context…</span
										>
									</div>
								{:else}
									<p class="font-sans text-xs leading-relaxed text-ink dark:text-dark-ink">
										{citationExplain.result}
									</p>
									<p class="mt-1.5 font-sans text-[10px] text-ink-faint dark:text-dark-ink-faint">
										Generated by AI · may be inaccurate
									</p>
								{/if}
							</div>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Selection AI review popover -->
			{#if selectionReview && selectionReview.coords}
				<div
					class="pointer-events-none fixed z-20"
					style="top: {selectionReview.coords.bottom + 8}px; left: {selectionReview.coords.left}px;"
				>
					<div
						class="pointer-events-auto w-96 rounded-lg border border-paper-border bg-paper shadow-lg dark:border-dark-paper-border dark:bg-dark-paper"
					>
						<div
							class="flex items-center justify-between border-b border-paper-border px-3 py-2 dark:border-dark-paper-border"
						>
							<span class="font-sans text-xs font-semibold text-ink dark:text-dark-ink"
								>{reviewTypeLabels[selectionReview.reviewType]}</span
							>
							<button
								onclick={() => (selectionReview = null)}
								class="text-ink-faint transition-colors hover:text-ink dark:text-dark-ink-faint dark:hover:text-dark-ink"
								aria-label="Close"
							>
								<svg
									width="12"
									height="12"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"><path d="M18 6L6 18M6 6l12 12" /></svg
								>
							</button>
						</div>
						<div class="space-y-2 px-3 py-2.5">
							{#if selectionReview.loading}
								<div class="flex items-center gap-2">
									<Spinner size="sm" class="text-accent" />
									<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint"
										>Reviewing…</span
									>
								</div>
							{:else}
								<p
									class="font-sans text-xs leading-relaxed whitespace-pre-wrap text-ink dark:text-dark-ink"
								>
									{selectionReview.suggestion}
								</p>
								<p class="font-sans text-[10px] text-ink-faint italic dark:text-dark-ink-faint">
									{selectionReview.explanation}
								</p>
								<div class="flex gap-2 pt-1">
									<button
										onclick={acceptSelectionReview}
										class="rounded bg-accent px-3 py-1 font-sans text-xs font-semibold text-white hover:bg-accent-hover"
									>
										Accept
									</button>
									<button
										onclick={() => (selectionReview = null)}
										class="rounded border border-paper-border px-3 py-1 font-sans text-xs text-ink-faint hover:text-ink dark:border-dark-paper-border dark:text-dark-ink-faint dark:hover:text-dark-ink"
									>
										Discard
									</button>
								</div>
								<p class="font-sans text-[10px] text-ink-faint dark:text-dark-ink-faint">
									Generated by AI · may be inaccurate
								</p>
							{/if}
						</div>
					</div>
				</div>
			{/if}

			<!-- Author info popover -->
			{#if authorPopover && authorPopover.coords}
				<div
					class="fixed inset-0 z-20"
					onclick={() => (authorPopover = null)}
					aria-hidden="true"
				></div>
				<div
					class="pointer-events-none fixed z-20"
					style="top: {authorPopover.coords.bottom + 8}px; left: {authorPopover.coords.left}px;"
				>
					<div
						class="pointer-events-auto w-72 rounded-lg border border-paper-border bg-paper shadow-lg dark:border-dark-paper-border dark:bg-dark-paper"
					>
						<!-- header -->
						<div
							class="flex items-center justify-between border-b border-paper-border px-3 py-2 dark:border-dark-paper-border"
						>
							<span class="font-sans text-xs font-semibold text-ink dark:text-dark-ink"
								>{authorPopover.name}</span
							>
							<button
								onclick={() => (authorPopover = null)}
								class="text-ink-faint transition-colors hover:text-ink dark:text-dark-ink-faint dark:hover:text-dark-ink"
								aria-label="Close"
							>
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none"
									><path
										d="M18 6L6 18M6 6l12 12"
										stroke="currentColor"
										stroke-width="1.5"
										stroke-linecap="round"
									/></svg
								>
							</button>
						</div>
						<!-- body -->
						{#if authorPopover.loading}
							<div class="flex items-center gap-2 px-3 py-2.5">
								<Spinner size="sm" class="text-accent" />
								<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint"
									>Loading…</span
								>
							</div>
						{:else if authorPopover.result}
							<div class="flex gap-3 p-3">
								{#if authorPopover.result.photo}
									<img
										src={authorPopover.result.photo}
										alt={authorPopover.name}
										class="h-28 w-20 shrink-0 rounded object-cover object-top"
									/>
								{/if}
								<div class="min-w-0 flex-1">
									{#if authorPopover.result.note}
										<p
											class="font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted"
										>
											{authorPopover.result.note}
										</p>
									{/if}
									<p class="mt-2 font-sans text-[10px] text-ink-faint dark:text-dark-ink-faint">
										AI · may be inaccurate
									</p>
								</div>
							</div>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Heading word count tooltip -->
			{#if headingTooltip && headingTooltip.coords}
				<div
					class="pointer-events-none fixed z-20"
					style="top: {headingTooltip.coords.bottom + 6}px; left: {headingTooltip.coords.left}px;"
				>
					<div
						class="pointer-events-auto flex items-center gap-1.5 rounded border border-paper-border bg-paper px-2.5 py-1.5 shadow-sm dark:border-dark-paper-border dark:bg-dark-paper"
					>
						<svg
							width="11"
							height="11"
							viewBox="0 0 24 24"
							fill="none"
							class="text-ink-faint dark:text-dark-ink-faint"
							aria-hidden="true"
						>
							<path
								d="M4 6h16M4 12h10M4 18h7"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
							/>
						</svg>
						<span class="font-sans text-xs text-ink-muted dark:text-dark-ink-muted"
							>{headingTooltip.wordCount} words in this section</span
						>
						<button
							onclick={() => (headingTooltip = null)}
							class="ml-1 text-ink-faint hover:text-ink dark:text-dark-ink-faint dark:hover:text-dark-ink"
							aria-label="Close"
						>
							<svg width="10" height="10" viewBox="0 0 24 24" fill="none"
								><path
									d="M18 6L6 18M6 6l12 12"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linecap="round"
								/></svg
							>
						</button>
					</div>
				</div>
			{/if}

			<!-- New comment popover (anchored near selection) -->
			{#if showNewComment && currentSelection && currentSelection.coords}
				<div
					class="pointer-events-none fixed z-20"
					style="top: {currentSelection.coords.bottom + 8}px; left: {currentSelection.coords
						.left}px;"
				>
					<div
						class="pointer-events-auto w-72 rounded-xl border border-paper-border bg-paper p-3 shadow-xl dark:border-dark-paper-border dark:bg-dark-paper"
					>
						<p
							class="mb-2 truncate border-l-2 border-amber-400 pl-2 font-sans text-xs text-ink-muted italic dark:text-dark-ink-muted"
						>
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

			<!-- Paragraph comment form -->
			{#if showNewParagraphComment && pendingParagraphNumber !== null}
				<div
					class="pointer-events-none fixed z-20"
					style="top: {paragraphCommentPos.top}px; right: {window.innerWidth - paragraphCommentPos.right + 8}px;"
				>
					<div
						class="pointer-events-auto w-72 rounded-xl border border-paper-border bg-paper p-3 shadow-xl dark:border-dark-paper-border dark:bg-dark-paper"
					>
						<p class="mb-2 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
							Comentario en ¶{pendingParagraphNumber}
						</p>
						<textarea
							bind:value={paragraphCommentText}
							rows={3}
							placeholder="Write your comment…"
							class="w-full resize-none rounded-md border border-paper-border bg-paper-ui px-2 py-1.5 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
						></textarea>
						<div class="mt-2 flex gap-2">
							<button
								onclick={submitParagraphComment}
								disabled={submittingParagraphComment || !paragraphCommentText.trim()}
								class="flex-1 rounded-md bg-accent py-1.5 font-sans text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
							>
								{submittingParagraphComment ? 'Saving…' : 'Comment'}
							</button>
							<button
								onclick={() => { showNewParagraphComment = false; paragraphCommentText = ''; }}
								class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted"
							>
								Cancel
							</button>
						</div>
					</div>
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
							<p
								class="px-1 py-6 text-center font-sans text-sm text-ink-muted dark:text-dark-ink-muted"
							>
								No comments yet.<br />
								<span class="text-xs text-ink-faint dark:text-dark-ink-faint"
									>Selecciona texto para comentar.</span
								>
							</p>
						{:else}
							{#each inlineComments as c (c.id)}
								<div data-comment-id={c.id}>
									<CommentThread
										comment={{ ...c, resolved: c.status === 'resolved' }}
										currentUserId={data.currentUserId}
										isActive={c.id === currentCommentId}
										onclick={handleCommentClick}
										onresolved={handleCommentResolved}
										onreopened={handleCommentReopened}
										onreplyadded={handleReplyAdded}
										ondeleted={(id) => {
											inlineComments = inlineComments.filter((x) => x.id !== id);
										}}
										{chapters}
										onlookup={lookupNames}
									/>
								</div>
							{/each}
						{/if}
					</div>
				</div>
			{/if}

			<!-- Backlinks panel -->
			{#if backlinks.length > 0}
				<div
					class="flex w-56 shrink-0 flex-col overflow-hidden border-l border-paper-border bg-paper dark:border-dark-paper-border dark:bg-dark-paper"
				>
					<div class="border-b border-paper-border px-4 py-3 dark:border-dark-paper-border">
						<h3 class="font-serif text-sm font-semibold text-ink dark:text-dark-ink">
							Mencionado en
						</h3>
					</div>
					<div class="flex-1 overflow-y-auto p-2">
						{#each backlinks as link (link.id)}
							<a
								href="/projects/{data.document.projectId}/documents/{link.id}"
								class="flex items-center gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-paper-ui dark:hover:bg-dark-paper-ui"
							>
								<svg
									width="12"
									height="12"
									viewBox="0 0 24 24"
									fill="none"
									class="shrink-0 text-accent"
									aria-hidden="true"
								>
									<path
										d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
									/>
									<path
										d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
									/>
								</svg>
								<span class="truncate font-sans text-xs text-ink-muted dark:text-dark-ink-muted"
									>{link.title}</span
								>
							</a>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Spell check sidebar -->
			{#if showSpellPanel}
				<div class="flex w-72 shrink-0 flex-col overflow-hidden border-l border-paper-border dark:border-dark-paper-border">
					<SpellCheckPanel
						bind:corrections={spellCorrections}
						loading={spellLoading}
						documentText={content}
						onaccept={applySpellCorrection}
						onignore={ignoreSpellWord}
						onclose={() => { showSpellPanel = false; spellCorrections = []; editorEl?.clearSpellHover(); }}
						onhover={(c) => editorEl?.setSpellHover(c.from, c.to)}
						onhoverend={() => editorEl?.clearSpellHover()}
					/>
				</div>
			{/if}

			<!-- Grammar assistant sidebar -->
			{#if showGrammarPanel}
				<div class="flex w-72 shrink-0 flex-col overflow-hidden border-l border-paper-border dark:border-dark-paper-border">
					<SpellCheckPanel
						bind:corrections={grammarCorrections}
						loading={grammarLoading}
						mode="grammar"
						documentText={content}
						onaccept={applyGrammarCorrection}
						onignore={async () => {}}
						onclose={() => { showGrammarPanel = false; grammarCorrections = []; editorEl?.clearSpellHover(); }}
						onhover={(c) => editorEl?.setSpellHover(c.from, c.to)}
						onhoverend={() => editorEl?.clearSpellHover()}
					/>
				</div>
			{/if}

			<!-- Chat assistant sidebar -->
			{#if showChat}
				<div
					class="flex h-full w-80 shrink-0 flex-col overflow-hidden border-l border-paper-border dark:border-dark-paper-border"
				>
					<AiEditorPanel
						projectId={data.document.projectId}
						documentId={data.document.id}
						documentTitle={data.document.title}
						getDocumentContent={() => content}
						spellLanguage={spellLanguage}
						onApplyEdit={(action) => {
							if (action.type === 'replace_text') {
								const idx = content.indexOf(action.anchorText);
								if (idx !== -1) content = content.slice(0, idx) + action.replacement + content.slice(idx + action.anchorText.length);
							} else if (action.type === 'insert_after') {
								const idx = content.indexOf(action.anchorText);
								if (idx !== -1) content = content.slice(0, idx + action.anchorText.length) + '\n\n' + action.content + content.slice(idx + action.anchorText.length);
							}
						}}
						onClose={toggleChat}
						orgId={data.projectOrgId}
					/>
				</div>
			{/if}

			<!-- Review sidebar -->
			{#if showReview}
				<div
					class="flex w-80 shrink-0 flex-col overflow-hidden border-l border-paper-border bg-paper dark:border-dark-paper-border dark:bg-dark-paper"
				>
					<div
						class="flex items-center justify-between border-b border-paper-border px-4 py-3 dark:border-dark-paper-border"
					>
						<h3 class="font-serif text-sm font-semibold text-ink dark:text-dark-ink">
							Document review
						</h3>
						<div class="flex items-center gap-2">
							{#if loadingReview}
								<Spinner size="sm" class="text-accent" />
							{/if}
							<button
								type="button"
								onclick={toggleReview}
								class="text-ink-faint transition-colors hover:text-ink-muted dark:text-dark-ink-faint dark:hover:text-dark-ink-muted"
								aria-label="Close review"
							>
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
									<path
										d="M18 6L6 18M6 6l12 12"
										stroke="currentColor"
										stroke-width="1.5"
										stroke-linecap="round"
									/>
								</svg>
							</button>
						</div>
					</div>

					<div class="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
						{#if !reviewResult && !loadingReview}
							<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
								Checks each project requirement against the document content, and identifies
								relevant references that aren't cited yet.
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
							<p class="py-6 text-center font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
								Analysing document…
							</p>
						{/if}

						{#if reviewError}
							<div
								class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-xs text-red-600 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-400"
							>
								{#if reviewError === NO_KEY_MSG}
									No AI key configured. <a
										href="/settings?tab=ai"
										class="underline underline-offset-2 hover:opacity-80">Go to Settings → AI</a
									> to add one.
								{:else}
									{reviewError}
								{/if}
							</div>
						{/if}

						{#if reviewResult}
							<!-- Requirements checklist -->
							{#if reviewResult.requirements.length > 0}
								<div>
									<p
										class="mb-2 font-sans text-[11px] font-medium tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint"
									>
										Requirements
									</p>
									<div class="flex flex-col gap-2">
										{#each reviewResult.requirements as req}
											<div
												class="rounded-lg border {req.covered
													? 'border-green-200 bg-green-50 dark:border-green-800/40 dark:bg-green-900/10'
													: 'border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-900/10'} px-3 py-2"
											>
												<div class="flex items-start gap-2">
													<span
														class="mt-0.5 shrink-0 text-sm {req.covered
															? 'text-green-600 dark:text-green-400'
															: 'text-amber-600 dark:text-amber-400'}"
													>
														{req.covered ? '✓' : '✗'}
													</span>
													<div>
														<p class="font-sans text-xs font-medium text-ink dark:text-dark-ink">
															{req.name}
														</p>
														{#if req.note}
															<p
																class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted"
															>
																{req.note}
															</p>
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
									<p
										class="mb-2 font-sans text-[11px] font-medium tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint"
									>
										Relevant but uncited
									</p>
									<div class="flex flex-col gap-1.5">
										{#each reviewResult.uncitedRefs as citeKey}
											<button
												type="button"
												onclick={() => editorEl?.insertAtCursor(`[[@${citeKey}]]`)}
												title="Insert citation"
												class="flex items-center justify-between rounded-md border border-paper-border bg-paper-ui px-3 py-2 text-left transition-colors hover:border-accent/40 dark:border-dark-paper-border dark:bg-dark-paper-ui"
											>
												<span class="font-mono text-xs text-ink dark:text-dark-ink"
													>[[@{citeKey}]]</span
												>
												<span class="font-sans text-[10px] text-ink-faint dark:text-dark-ink-faint"
													>insert</span
												>
											</button>
										{/each}
									</div>
								</div>
							{:else if reviewResult.requirements.length > 0}
								<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
									All relevant references are cited.
								</p>
							{/if}

							<!-- Review questions -->
							<div class="border-t border-paper-border pt-4 dark:border-dark-paper-border">
								<p
									class="mb-2 font-sans text-[11px] font-medium tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint"
								>
									Critical questions
								</p>
								{#if !reviewQuestions && !loadingQuestions}
									<p class="mb-2 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
										Questions a peer reviewer would likely raise about this document.
									</p>
									<button
										type="button"
										onclick={runReviewQuestions}
										disabled={!hasAiKey}
										class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-ui disabled:opacity-40 dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
									>
										Generate questions
									</button>
								{:else if loadingQuestions}
									<p class="py-2 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
										Generating…
									</p>
								{:else if questionsError}
									<p class="font-sans text-xs text-red-500">{questionsError}</p>
								{:else if reviewQuestions}
									<ol class="flex flex-col gap-2">
										{#each reviewQuestions as q, i}
											<li class="flex items-start gap-2">
												<span
													class="mt-0.5 shrink-0 font-sans text-[10px] font-semibold text-ink-faint dark:text-dark-ink-faint"
													>{i + 1}.</span
												>
												<span class="font-sans text-xs leading-relaxed text-ink dark:text-dark-ink"
													>{q}</span
												>
											</li>
										{/each}
									</ol>
									<button
										type="button"
										onclick={runReviewQuestions}
										disabled={loadingQuestions}
										class="mt-3 rounded-md border border-paper-border px-3 py-1.5 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-ui disabled:opacity-40 dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
									>
										Regenerate
									</button>
								{/if}
							</div>

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

			<!-- Enrich sidebar -->
			{#if showEnrich}
				<div
					class="flex w-80 shrink-0 flex-col overflow-hidden border-l border-paper-border bg-paper dark:border-dark-paper-border dark:bg-dark-paper"
				>
					<div
						class="flex items-center justify-between border-b border-paper-border px-4 py-3 dark:border-dark-paper-border"
					>
						<h3 class="font-serif text-sm font-semibold text-ink dark:text-dark-ink">
							Enrich document
						</h3>
						<button
							type="button"
							onclick={toggleEnrich}
							class="text-ink-faint transition-colors hover:text-ink-muted dark:text-dark-ink-faint dark:hover:text-dark-ink-muted"
							aria-label="Close"
						>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none"
								><path
									d="M18 6L6 18M6 6l12 12"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linecap="round"
								/></svg
							>
						</button>
					</div>

					<div class="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
						{#if !enrichResult && !loadingEnrich}
							<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
								Finds person names not yet tagged as <code
									class="rounded bg-paper-ui px-1 font-mono text-[11px] dark:bg-dark-paper-ui"
									>[[person:]]</code
								> and informal citations that match a reference in your bibliography.
							</p>
							<button
								type="button"
								onclick={runEnrich}
								class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
							>
								Analyse document
							</button>
						{:else if loadingEnrich}
							<p class="py-6 text-center font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
								Analysing…
							</p>
						{:else if enrichError}
							<p class="font-sans text-xs text-red-500">{enrichError}</p>
						{:else if enrichResult}
							{#if enrichResult.persons.length === 0 && enrichResult.refs.length === 0}
								<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
									No untagged persons or informal citations found.
								</p>
							{:else}
								<button
									type="button"
									onclick={applyAll}
									class="rounded-md border border-accent/40 bg-accent/5 px-3 py-1.5 font-sans text-xs text-accent transition-colors hover:bg-accent/10"
								>
									Apply all
								</button>
							{/if}

							{#if enrichResult.persons.length > 0}
								<div>
									<p
										class="mb-2 font-sans text-[11px] font-medium tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint"
									>
										People
									</p>
									<div class="flex flex-col gap-1.5">
										{#each enrichResult.persons as name}
											{@const snippet = enrichSnippet(name)}
											<div
												class="flex items-start justify-between rounded-md border border-paper-border bg-paper-ui px-3 py-2 dark:border-dark-paper-border dark:bg-dark-paper-ui"
											>
												<div class="min-w-0">
													{#if snippet}
														<p
															class="font-sans text-[11px] leading-relaxed text-ink-muted dark:text-dark-ink-muted"
														>
															{snippet.before}<strong class="text-ink dark:text-dark-ink"
																>{snippet.match}</strong
															>{snippet.after}
														</p>
													{/if}
													<span
														class="mt-0.5 block font-mono text-[10px] text-ink-faint dark:text-dark-ink-faint"
														>→ [[person:{name}]]</span
													>
												</div>
												<button
													type="button"
													onclick={() => applyPerson(name)}
													class="ml-2 shrink-0 font-sans text-[10px] text-accent hover:underline"
													>Apply</button
												>
											</div>
										{/each}
									</div>
								</div>
							{/if}

							{#if enrichResult.refs.length > 0}
								<div>
									<p
										class="mb-2 font-sans text-[11px] font-medium tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint"
									>
										Informal citations
									</p>
									<div class="flex flex-col gap-1.5">
										{#each enrichResult.refs as ref}
											{@const refTextIdx = ref.context.indexOf(ref.text)}
											{@const refSnippet =
												refTextIdx !== -1
													? {
															before: ref.context.slice(0, refTextIdx),
															match: ref.text,
															after: ref.context.slice(refTextIdx + ref.text.length)
														}
													: enrichSnippet(ref.text)}
											<div
												class="flex items-start justify-between rounded-md border border-paper-border bg-paper-ui px-3 py-2 dark:border-dark-paper-border dark:bg-dark-paper-ui"
											>
												<div class="min-w-0">
													{#if refSnippet}
														<p
															class="font-sans text-[11px] leading-relaxed text-ink-muted dark:text-dark-ink-muted"
														>
															{refSnippet.before}<strong class="text-ink dark:text-dark-ink"
																>{refSnippet.match}</strong
															>{refSnippet.after}
														</p>
													{/if}
													<span
														class="mt-0.5 block font-mono text-[10px] text-ink-faint dark:text-dark-ink-faint"
														>→ [[@{ref.citeKey}]]</span
													>
												</div>
												<button
													type="button"
													onclick={() => applyRef(ref.context, ref.text, ref.citeKey)}
													class="ml-2 shrink-0 font-sans text-[10px] text-accent hover:underline"
													>Apply</button
												>
											</div>
										{/each}
									</div>
								</div>
							{/if}

							<button
								type="button"
								onclick={runEnrich}
								disabled={loadingEnrich}
								class="mt-auto rounded-md border border-paper-border px-3 py-1.5 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-ui disabled:opacity-40 dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
							>
								Re-analyse
							</button>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Draft assistant sidebar -->
			{#if showDraft}
				<div
					class="flex w-80 shrink-0 flex-col overflow-hidden border-l border-paper-border bg-paper dark:border-dark-paper-border dark:bg-dark-paper"
				>
					<div
						class="flex items-center justify-between border-b border-paper-border px-4 py-3 dark:border-dark-paper-border"
					>
						<h3 class="font-serif text-sm font-semibold text-ink dark:text-dark-ink">
							Draft assistant
						</h3>
						<button
							type="button"
							onclick={toggleDraft}
							class="text-ink-faint transition-colors hover:text-ink-muted dark:text-dark-ink-faint dark:hover:text-dark-ink-muted"
							aria-label="Close draft assistant"
						>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<path
									d="M18 6L6 18M6 6l12 12"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linecap="round"
								/>
							</svg>
						</button>
					</div>

					<div class="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
						<!-- Mode toggle -->
						<div
							class="flex overflow-hidden rounded-lg border border-paper-border dark:border-dark-paper-border"
						>
							<button
								type="button"
								onclick={() => setDraftMode('new')}
								class="flex-1 py-1.5 font-sans text-xs transition-colors {draftMode === 'new'
									? 'bg-accent text-white'
									: 'text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui'}"
							>
								New text
							</button>
							<button
								type="button"
								onclick={() => setDraftMode('rewrite')}
								class="flex-1 border-l border-paper-border py-1.5 font-sans text-xs transition-colors dark:border-dark-paper-border {draftMode ===
								'rewrite'
									? 'bg-accent text-white'
									: 'text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui'}"
							>
								Rewrite selection
							</button>
						</div>

						{#if draftMode === 'new'}
							<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
								Describe what to write. The assistant will use your project references,
								requirements, and existing documents as context.
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
									<div
										class="rounded-lg border border-paper-border bg-paper-ui px-3 py-2 font-mono text-xs text-ink-muted dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink-muted"
										style="max-height: 80px; overflow-y: auto;"
									>
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
							disabled={!draftInstruction.trim() ||
								loadingDraft ||
								(draftMode === 'rewrite' && !capturedSelection)}
							class="flex items-center justify-center gap-2 rounded-lg bg-accent py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
						>
							{#if loadingDraft}
								<Spinner size="sm" class="text-white" />
								Generating…
							{:else}
								Generate
							{/if}
						</button>

						{#if draftError}
							<div
								class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-xs text-red-600 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-400"
							>
								{#if draftError === NO_KEY_MSG}
									No AI key configured. <a
										href="/settings?tab=ai"
										class="underline underline-offset-2 hover:opacity-80">Go to Settings → AI</a
									> to add one.
								{:else}
									{draftError}
								{/if}
							</div>
						{/if}

						{#if draftResult}
							<div class="flex flex-col gap-2">
								<!-- Diff preview: original → new (rewrite mode only) -->
								{#if draftMode === 'rewrite' && capturedSelection}
									<div class="rounded-xl border border-accent/20 bg-accent/5 p-3">
										<div
											class="mb-2 space-y-1 rounded-md bg-paper px-2.5 py-2 font-mono text-xs dark:bg-dark-paper"
										>
											<p class="text-red-500 line-through opacity-70">{capturedSelection.text}</p>
											<p class="text-green-600 dark:text-green-400">{draftResult}</p>
										</div>
									</div>
								{:else}
									<div
										class="rounded-lg border border-paper-border bg-paper-ui px-3 py-2.5 font-sans text-sm leading-relaxed text-ink dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
										style="white-space: pre-wrap;"
									>
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
							<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint"
								>Cargando...</span
							>
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
												<p class="font-sans text-xs font-semibold text-accent">
													v{v.versionNumber}
												</p>
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
													onclick={() =>
														window.open(
															`/projects/${data.document.projectId}/documents/${data.document.id}/diff/${v.id}`,
															'_blank'
														)}
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
														oldLabel={compareDiff.previous
															? `v${compareDiff.previous.versionNumber}`
															: '(empty)'}
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
				onclick={(e) => {
					if (e.target === e.currentTarget) showCitePicker = false;
				}}
			>
				<div
					class="w-full max-w-sm rounded-t-2xl border border-paper-border bg-paper shadow-2xl sm:rounded-2xl dark:border-dark-paper-border dark:bg-dark-paper"
				>
					<div
						class="flex items-center justify-between border-b border-paper-border px-5 py-3.5 dark:border-dark-paper-border"
					>
						<h2 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">
							Insertar cita
						</h2>
						<button
							onclick={() => (showCitePicker = false)}
							aria-label="Cerrar"
							class="rounded-md p-1 text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
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
							<p
								class="px-3 py-4 text-center font-sans text-sm text-ink-faint dark:text-dark-ink-faint"
							>
								Cargando…
							</p>
						{:else if projectRefs.length === 0}
							<div class="px-3 py-6 text-center">
								<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
									Sin referencias en este proyecto.
								</p>
								<a
									href="/projects/{data.document.projectId}/bib"
									class="mt-1 block font-sans text-xs text-accent hover:underline"
								>
									Go to Bibliography →
								</a>
							</div>
						{:else if filteredRefs().length === 0}
							<p
								class="px-3 py-4 text-center font-sans text-sm text-ink-faint dark:text-dark-ink-faint"
							>
								Sin resultados.
							</p>
						{:else}
							{#each filteredRefs() as ref (ref.citeKey)}
								<button
									onclick={() => insertCitation(ref)}
									class="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-paper-ui dark:hover:bg-dark-paper-ui"
								>
									<span
										class="mt-0.5 shrink-0 rounded-md border border-accent/30 bg-accent/5 px-1.5 py-0.5 font-mono text-xs text-accent"
									>
										{ref.citeKey}
									</span>
									<span class="min-w-0">
										<span class="block truncate font-sans text-sm text-ink dark:text-dark-ink"
											>{ref.title}</span
										>
										<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
											{ref.authors[0]?.last ?? ''}{ref.authors.length > 1 ? ' et al.' : ''}{ref.year
												? ' · ' + ref.year
												: ''}
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
					<h2 class="font-serif text-xl font-semibold text-ink dark:text-dark-ink">
						Create version
					</h2>
					<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
						Describe the changes in this version.
					</p>

					<div class="mt-4 flex flex-col gap-3">
						<textarea
							bind:value={commitMessage}
							rows={3}
							autofocus
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
	</div>
	<!-- end desktop editor wrapper -->
{/if}

<!-- Floating dropdown menus — rendered at root level to escape backdrop-filter containing block -->
{#if showCiteStyleMenu}
	<button class="fixed inset-0 z-10" onclick={() => (showCiteStyleMenu = false)} aria-label="Close menu" tabindex="-1"></button>
	<div
		class="fixed z-20 w-28 overflow-hidden rounded-md border border-paper-border bg-paper shadow-lg dark:border-dark-paper-border dark:bg-dark-paper"
		style="top: {citeStyleMenuPos.top}px; left: {citeStyleMenuPos.left}px;"
	>
		{#each Object.entries(CITATION_STYLE_LABELS) as [s, label] (s)}
			<button
				onclick={() => { setCitationStyle(s as CitationStyle); showCiteStyleMenu = false; }}
				class="flex w-full items-center justify-between px-3 py-2 font-sans text-xs transition-colors hover:bg-paper-ui dark:hover:bg-dark-paper-ui {citationStyle === s ? 'font-semibold text-accent' : 'text-ink-muted dark:text-dark-ink-muted'}"
			>
				{label}
				{#if citationStyle === s}
					<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
				{/if}
			</button>
		{/each}
	</div>
{/if}

{#if showExport}
	<button class="fixed inset-0 z-10" onclick={() => (showExport = false)} aria-label="Close menu" tabindex="-1"></button>
	<div
		class="fixed z-20 w-44 overflow-hidden rounded-xl border border-paper-border bg-paper shadow-lg dark:border-dark-paper-border dark:bg-dark-paper"
		style="top: {exportMenuPos.top}px; left: {exportMenuPos.left}px;"
	>
		<a href="/api/projects/{data.document?.projectId}/documents/{data.document?.id}/export?format=latex" onclick={() => (showExport = false)} class="flex items-center gap-2.5 px-4 py-2.5 font-sans text-sm text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui">
			<span class="font-mono text-xs text-ink-faint dark:text-dark-ink-faint">.tex</span>LaTeX
		</a>
		<a href="/api/projects/{data.document?.projectId}/documents/{data.document?.id}/export?format=typst" onclick={() => (showExport = false)} class="flex items-center gap-2.5 px-4 py-2.5 font-sans text-sm text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui">
			<span class="font-mono text-xs text-ink-faint dark:text-dark-ink-faint">.typ</span>Typst
		</a>
		<a
			href={data.document?.type === 'book'
				? `/api/projects/${data.document?.projectId}/documents/${data.document?.id}/book-export`
				: `/api/projects/${data.document?.projectId}/documents/${data.document?.id}/export?format=pdf`}
			onclick={() => (showExport = false)}
			class="flex items-center gap-2.5 px-4 py-2.5 font-sans text-sm text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
		>
			<span class="font-mono text-xs text-ink-faint dark:text-dark-ink-faint">.pdf</span>PDF
		</a>
	</div>
{/if}

<svelte:window
	onkeydown={(e) => {
		if (e.key === '/' && (e.ctrlKey || e.metaKey)) {
			e.preventDefault();
			showCheatsheet = !showCheatsheet;
		}
		if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
			e.preventDefault();
			doSaveDraft();
		}
		if (e.key === 'Escape') { showCheatsheet = false; showCiteStyleMenu = false; citationExplain = null; }
	}}
	onclick={() => { showCiteStyleMenu = false; }}
/>

{#if showCheatsheet}
	<div
		class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
		role="presentation"
		onclick={() => (showCheatsheet = false)}
	></div>

	<div
		class="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col overflow-hidden bg-paper shadow-2xl dark:bg-dark-paper"
	>
		<div
			class="flex shrink-0 items-center justify-between border-b border-paper-border px-6 py-4 dark:border-dark-paper-border"
		>
			<p class="font-serif text-lg font-semibold text-ink dark:text-dark-ink">
				Referencia de sintaxis
			</p>
			<button
				onclick={() => (showCheatsheet = false)}
				class="rounded p-1 text-ink-faint hover:text-ink dark:text-dark-ink-faint dark:hover:text-dark-ink"
				aria-label="Cerrar"
			>
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M18 6L6 18M6 6l12 12"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
					/>
				</svg>
			</button>
		</div>

		<div class="flex-1 space-y-6 overflow-y-auto px-6 py-5 font-sans text-sm">
			<div>
				<p class="mb-2 font-medium text-ink dark:text-dark-ink">Formato</p>
				<table class="w-full">
					<tbody class="divide-y divide-paper-border dark:divide-dark-paper-border">
						{#each [['# Title', 'Heading 1'], ['## Section', 'Heading 2'], ['**negrita**', 'Negrita'], ['*cursiva*', 'Cursiva'], ['`code`', 'Inline code'], ['> cita', 'Bloque de cita'], ['- elemento', 'Lista'], ['1. elemento', 'Lista numerada'], ['[texto](url)', 'Enlace'], ['---', 'Separador']] as item}
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
							<td class="py-1.5 pr-4 font-mono text-xs text-accent">[[@citeKey]]</td>
							<td class="py-1.5 text-ink-muted dark:text-dark-ink-muted">Single citation</td>
						</tr>
						<tr>
							<td class="py-1.5 pr-4 font-mono text-xs text-accent">[[@key1; @key2]]</td>
							<td class="py-1.5 text-ink-muted dark:text-dark-ink-muted">Multiple citations</td>
						</tr>
					</tbody>
				</table>
				<p class="mt-1.5 text-xs text-ink-faint dark:text-dark-ink-faint">
					Type <span class="font-mono">[[@</span> to autocomplete.
				</p>
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
						{#each [['$\\neg p$', '¬p', 'Negation'], ['$p \\land q$', 'p ∧ q', 'Conjunction'], ['$p \\lor q$', 'p ∨ q', 'Disjunction'], ['$p \\rightarrow q$', 'p → q', 'Implication'], ['$p \\leftrightarrow q$', 'p ↔ q', 'Bicondicional'], ['$\\forall x$', '∀x', 'Universal'], ['$\\exists x$', '∃x', 'Existencial'], ['$\\therefore$', '∴', 'Por tanto'], ['$\\bot$ / $\\top$', '⊥ / ⊤', 'Contradiction / Tautology']] as item}
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
							<td class="py-1.5 text-ink-muted dark:text-dark-ink-muted">Same project</td>
						</tr>
						<tr>
							<td class="py-1.5 pr-4 font-mono text-xs text-accent">[[Title:hash]]</td>
							<td class="py-1.5 text-ink-muted dark:text-dark-ink-muted">External document</td>
						</tr>
					</tbody>
				</table>
			</div>

			<div>
				<p class="mb-2 font-medium text-ink dark:text-dark-ink">Atajos de teclado</p>
				<table class="w-full">
					<tbody class="divide-y divide-paper-border dark:divide-dark-paper-border">
						{#each [['Ctrl+S', 'Save draft'], ['Ctrl+/', 'This reference'], ['Esc', 'Close panels']] as item}
							<tr>
								<td class="py-1.5 pr-4">
									<kbd
										class="rounded border border-paper-border bg-paper-ui px-1.5 py-0.5 font-mono text-xs text-ink dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
										>{item[0]}</kbd
									>
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

<!-- ── Writer lost modal ── -->
{#if writerLostContent !== null}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
		role="dialog"
		aria-modal="true"
	>
		<div
			class="flex w-full max-w-lg flex-col gap-4 rounded-2xl bg-paper p-6 shadow-xl dark:bg-dark-paper"
		>
			<div>
				<h2 class="font-serif text-lg font-semibold text-ink dark:text-dark-ink">
					Cambios offline no sincronizados
				</h2>
				<p class="mt-1 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
					Mientras estabas sin conexión, otro colaborador tomó el control de edición. Tus cambios no
					se han sincronizado. Cópialos antes de cerrar.
				</p>
			</div>
			<textarea
				readonly
				value={writerLostContent}
				class="h-48 w-full resize-none rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-mono text-xs text-ink focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
			></textarea>
			<div class="flex justify-end">
				<button
					type="button"
					onclick={async () => {
						await offlineDb.pendingEdits
							.where({ documentId: data.document.id, status: 'writer_lost' })
							.modify({ status: 'synced' });
						writerLostContent = null;
					}}
					class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90"
				>
					Descartar
				</button>
			</div>
		</div>
	</div>
{/if}

