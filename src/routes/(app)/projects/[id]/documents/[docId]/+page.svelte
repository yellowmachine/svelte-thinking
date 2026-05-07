<script lang="ts">
	import { onMount, onDestroy, untrack } from 'svelte';
	import TutorialManager from '$lib/components/tutorial/TutorialManager.svelte';
	import { documentTutorialSteps } from '$lib/tutorials/document';
	import { goto, beforeNavigate } from '$app/navigation';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { page } from '$app/state';
	import { workspaceStore } from '$lib/stores/workspace.svelte';
	import MobileNoteEditor from '$lib/components/editor/MobileNoteEditor.svelte';
	import MarkdownEditor from '$lib/components/editor/MarkdownEditor.svelte';
	import MarkdownPreview from '$lib/components/editor/MarkdownPreview.svelte';
	import SafeDeleteDialog from '$lib/components/ui/SafeDeleteDialog.svelte';
	import AiEditorPanel from '$lib/components/ai/AiEditorPanel.svelte';
	import AnnotationsPanel from '$lib/components/editor/AnnotationsPanel.svelte';
	import BibliographyPanel from '$lib/components/editor/BibliographyPanel.svelte';
	import CommentsPanel from '$lib/components/editor/CommentsPanel.svelte';
	import SpellCheckPanel, {
		type SpellCorrection
	} from '$lib/components/editor/SpellCheckPanel.svelte';
	import ReviewPanel from '$lib/components/editor/ReviewPanel.svelte';
	import VersionHistoryPanel from '$lib/components/editor/VersionHistoryPanel.svelte';
	import CommitDialog from '$lib/components/editor/CommitDialog.svelte';
	import CitePicker from '$lib/components/editor/CitePicker.svelte';
	import DraftPanel from '$lib/components/editor/DraftPanel.svelte';
	import EnrichPanel from '$lib/components/editor/EnrichPanel.svelte';
	import MarkdownCheatsheet from '$lib/components/editor/MarkdownCheatsheet.svelte';
	import WriterLostModal from '$lib/components/editor/WriterLostModal.svelte';
	import SelectionOverlays from '$lib/components/editor/SelectionOverlays.svelte';
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
		(data.collaborators.find((c) => c.userId === data.currentUserId)?.role ??
			null) as CollaboratorRole | null
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
			currentWriterName =
				userId === null
					? null
					: (data.collaborators.find((c) => c.userId === userId)?.name ?? userId);
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
	const VIEW_MODE_KEY = untrack(() => `view-mode-${data.document?.id ?? ''}`);
	const initialCanWrite = (() => {
		const role = (data.collaborators.find((c) => c.userId === data.currentUserId)?.role ??
			null) as CollaboratorRole | null;
		return canWriteDocument({
			isProjectOwner: data.currentUserId === data.projectOwnerId,
			writerUserId: data.document?.writerUserId ?? null,
			currentUserId: data.currentUserId,
			collaboratorRole: role
		});
	})();
	let viewMode = $state<ViewMode>(
		!initialCanWrite || data.forcePublished || data.document?.isReadonly
			? 'preview'
			: ((typeof localStorage !== 'undefined'
					? (localStorage.getItem(VIEW_MODE_KEY) as ViewMode | null)
					: null) ?? 'editor')
	);
	function setViewMode(m: ViewMode) {
		viewMode = m;
		localStorage.setItem(VIEW_MODE_KEY, m);
		if (m !== 'editor') loadRefs();
		if (m === 'preview') showBib = false;
	}

	// Citations
	let citationStyle = $state<CitationStyle>('apa');
	let projectRefs = $state<CiteRef[]>([]);
	let refsLoaded = $state(false);
	let showCitePicker = $state(false);
	let showCiteStyleMenu = $state(false);
	let citeStyleMenuPos = $state({ top: 0, left: 0 });
	let editorEl: {
		insertAtCursor: (text: string) => void;
		getSelection: () => { text: string; from: number; to: number } | null;
		replaceRange: (from: number, to: number, text: string) => void;
		insertMention: (name: string, from: number) => void;
		setGhostText: (text: string | null) => void;
		setSpellHover: (from: number, to: number) => void;
		clearSpellHover: () => void;
	} | null = $state(null);

	type PreviewRef = {
		scrollToComment: (id: string, paragraphNumber: number | null) => void;
		getParagraphText: (n: number) => string;
	} | null;
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
		const q = prefix.toLowerCase();
		const bibAuthors = [...new Set(projectRefs.flatMap((r) => r.authors.map((a) => a.last)))];
		const matches = bibAuthors.filter((n) => n.toLowerCase().startsWith(q));
		if (matches.length === 0) {
			editorEl?.setGhostText(null);
			ghostWord = null;
			return;
		}

		// Prefer the author already used closest before the cursor; fall back to first alphabetical
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
			if (lastBefore !== -1 && cursorPos - lastBefore < bestDist) {
				bestDist = cursorPos - lastBefore;
				bestName = name;
			}
		}
		if (!bestName) bestName = matches[0];
		ghostWord = { from, name: bestName };
		editorEl?.setGhostText(bestName.slice(prefix.length));
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

	function isNoKeyError(e: unknown): boolean {
		return !!(
			e &&
			typeof e === 'object' &&
			'data' in e &&
			(e as { data?: { code?: string } }).data?.code === 'PRECONDITION_FAILED'
		);
	}

	const NO_KEY_MSG = 'No AI key configured. Go to Settings → AI to add one.';

	async function lookupNames(partial: string, _context: string): Promise<string[]> {
		await loadRefs();
		if (!partial.trim()) return [];
		const q = partial.toLowerCase();
		const seen = new Set<string>();
		for (const ref of projectRefs) {
			for (const a of ref.authors) {
				if (a.last.toLowerCase().startsWith(q)) seen.add(a.last);
			}
		}
		return [...seen].sort();
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

	// Citation style: localStorage per-document overrides project default, which overrides 'apa'
	$effect(() => {
		if (!data.document) return;
		const stored = localStorage.getItem(`cite-style-${data.document.id}`);
		if (
			stored &&
			(stored === 'apa' || stored === 'ieee' || stored === 'vancouver' || stored === 'chicago')
		) {
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
				? result.corrections.map((c) => ({
						...c,
						from: c.from + scoped.offset,
						to: c.to + scoped.offset
					}))
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

	// ── Action capabilities ───────────────────────────────────────────────────
	const saveCap = $derived.by(() =>
		getSaveDraftCapability({
			canWrite,
			online: onlineStore.online,
			saving: saveStatus === 'saving'
		})
	);

	const commitCap = $derived.by(() =>
		getCommitCapability({
			canWrite,
			online: onlineStore.online,
			hasContent: content.trim().length > 0,
			committing: false
		})
	);

	const reclaimCap = $derived.by(() =>
		getReclaimWritingCapability({
			isOwner,
			writerUserId: currentWriterUserId
		})
	);

	const releaseWriterCap = $derived.by(() =>
		getReleaseWriterCapability({
			isCurrentWriter: data.currentUserId === currentWriterUserId,
			canWrite
		})
	);

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

	// ── Bibliography panel ────────────────────────────────────────────────────
	let showBib = $state(false);
	let bibFilter = $state('');
	let activeBibCiteKey = $state<string | null>(null);
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

	// Subnote form (triggered from floating button)
	let showSubnote = $state(false);

	// Annotations panel — subnotes for this document's source reference
	type Subnote = {
		id: number;
		referenceId: string;
		slug: string;
		notes: string;
		anchorText: string | null;
		createdAt: Date;
		updatedAt: Date;
	};
	let docSubnotes = $state<Subnote[]>([]);
	let sourceReference = $state(data.sourceReference);

	const sourceRefFull = $derived.by(() => {
		const sr = sourceReference;
		return sr ? (projectRefs.find((r) => r.id === sr.id) ?? null) : null;
	});
	const sourceRefCitation = $derived(
		sourceRefFull
			? formatFullCitation(sourceRefFull, citationStyle, 1)
					.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
					.replace(/\*(.+?)\*/g, '<em>$1</em>')
			: null
	);

	async function loadDocSubnotes() {
		if (!sourceReference) return;
		docSubnotes = (await trpc.references.listSubnotes.query({
			referenceId: sourceReference.id
		})) as Subnote[];
	}

	// New comment form (triggered from floating button)
	let showNewComment = $state(false);

	// Citation explain popover
	const CITE_SELECTION_RE = /^\[\[@([\w:._-]+)\]\]$/;

	function selectedCiteKey(): string | null {
		if (!currentSelection) return null;
		const m = currentSelection.text.trim().match(CITE_SELECTION_RE);
		return m ? m[1] : null;
	}

	// Author info popover
	let authorPopover: {
		name: string;
		coords: { bottom: number; left: number };
		refs: CiteRef[];
	} | null = $state(null);

	function showAuthorInfo(name: string, coords: { bottom: number; left: number }) {
		if (authorPopover?.name === name) return;
		const q = name.toLowerCase();
		const refs = projectRefs.filter((r) =>
			r.authors.some(
				(a) =>
					a.last.toLowerCase() === q ||
					`${a.first} ${a.last}`.toLowerCase() === q ||
					`${a.last}, ${a.first}`.toLowerCase() === q
			)
		);
		authorPopover = { name, coords, refs };
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
			const isNetworkError =
				e instanceof Error &&
				(e.message.includes('fetch') ||
					e.message.includes('network') ||
					e.message.includes('Failed to fetch') ||
					e.message.toLowerCase().includes('networkerror') ||
					('cause' in e && e.cause instanceof TypeError));
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
				console.warn(
					`[offline] save: network error detected — queued to Dexie (doc ${data.document.id})`
				);
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
						console.log(
							`[offline] reconnect: still ${edits.filter((e) => e.status === 'pending').length} pending edit(s) for doc ${documentId}`
						);
					}
				});
		}
	});

	function toggleHistory() {
		showHistory = !showHistory;
		if (showHistory) showComments = false;
	}

	function toggleComments() {
		showComments = !showComments;
		if (showComments) showHistory = false;
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
			case 'pending':
				return isDirty ? 'Unsaved changes' : '';
			case 'saving':
				return 'Saving...';
			case 'saved':
				return 'Saved';
			case 'error':
				return 'Error saving';
			case 'offline':
				return 'Guardado offline';
			default:
				return '';
		}
	});

	const openCommentsCount = $derived(inlineComments.filter((c) => c.status === 'open').length);

	const previewCommentAnchors = $derived([
		...inlineComments
			.filter((c) => c.status === 'open' && c.anchorText)
			.map((c) => ({ id: c.id, anchorText: c.anchorText! })),
		...docSubnotes
			.filter((s) => s.anchorText)
			.map((s) => ({ id: `ann-${s.id}`, anchorText: s.anchorText! }))
	]);

	function scrollToAnnotation(id: number) {
		previewRef?.scrollToComment(`ann-${id}`, null);
		splitPreviewRef?.scrollToComment(`ann-${id}`, null);
	}

	function getCiteKeyAtPos(pos: number): string | null {
		const re = /\[\[@([\w:._-]+)\]\]/g;
		let m: RegExpExecArray | null;
		while ((m = re.exec(content)) !== null) {
			if (m.index <= pos && pos <= m.index + m[0].length) return m[1];
		}
		return null;
	}

	function scrollEditorToCiteKey(citeKey: string) {
		const token = `[[@${citeKey}]]`;
		const pos = content.indexOf(token);
		if (pos >= 0) scrollToRange = { from: pos, to: pos + token.length };
	}

	function toggleBib() {
		showBib = !showBib;
		if (showBib) {
			loadRefs();
			bibFilter = '';
		}
	}

	const paragraphComments = $derived(
		inlineComments
			.filter((c) => c.status === 'open' && c.paragraphNumber !== null)
			.map((c) => ({ id: c.id, paragraphNumber: c.paragraphNumber! }))
	);

	// Paragraph comment form
	let showNewParagraphComment = $state(false);
	let pendingParagraphNumber = $state<number | null>(null);
	let paragraphCommentPos = $state({ top: 0, right: 0 });

	function handlePreviewSelection(sel: {
		text: string;
		coords: { top: number; bottom: number; left: number; right: number };
	}) {
		const from = content.indexOf(sel.text);
		const to = from >= 0 ? from + sel.text.length : 0;
		updateSelection({
			text: sel.text,
			from: Math.max(from, 0),
			to: Math.max(to, 0),
			coords: sel.coords
		});
	}

	function handlePreviewCommentClick(id: string) {
		showComments = true;
	}

	function handleParagraphComment(paragraphNumber: number, coords: { top: number; right: number }) {
		pendingParagraphNumber = paragraphNumber;
		paragraphCommentPos = coords;
		showNewParagraphComment = true;
	}

	// Export dropdown
	let showExport = $state(false);
	let exportMenuPos = $state({ top: 0, left: 0 });

	// ── AI task model labels (from layout data) ──────────────────────────────────
	const aiTaskConfig = $derived(data.aiTaskConfig ?? {});
	const hasAiKey = $derived(data.hasAiKey ?? false);
	const aiCtaType = $derived(
		hasAiKey
			? 'ok'
			: !data.projectOrgId
				? 'personal'
				: (data.orgs ?? []).find((o) => o.id === data.projectOrgId)?.role === 'owner'
					? 'org-owner'
					: 'org-member'
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
			showBib = false;
		}
	}

	// ── Review assistant ─────────────────────────────────────────────────────────
	let showReview = $state(false);

	function toggleReview() {
		showReview = !showReview;
		if (showReview) {
			showChat = false;
			showDraft = false;
			showHistory = false;
			showComments = false;
			showBib = false;
		}
	}

	// ── Enrich (find untagged) ───────────────────────────────────────────────────
	let showEnrich = $state(false);

	function toggleEnrich() {
		showEnrich = !showEnrich;
		if (showEnrich) {
			showChat = false;
			showReview = false;
			showDraft = false;
			showHistory = false;
			showComments = false;
			showBib = false;
		}
	}

	// ── Draft assistant ──────────────────────────────────────────────────────────
	let showDraft = $state(false);

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

	function toggleDraft() {
		showDraft = !showDraft;
		if (showDraft) {
			showChat = false;
			showReview = false;
			showHistory = false;
			showComments = false;
			showBib = false;
		}
	}

	// Show floating button only after selection stabilizes (not during drag)
	let showFloating = $state(false);
	let floatingDebounce: ReturnType<typeof setTimeout> | null = null;

	function updateSelection(sel: typeof currentSelection) {
		currentSelection = sel;
		activeBibCiteKey = sel ? getCiteKeyAtPos(sel.from) : null;
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
		if (e.key === 'Escape') {
			if (showFloating || showNewComment || showReviewTypeMenu) {
				showFloating = false;
				showNewComment = false;
				showReviewTypeMenu = false;
				currentSelection = null;
				e.stopPropagation();
				return;
			}
			if (showNewParagraphComment) {
				showNewParagraphComment = false;
				e.stopPropagation();
				return;
			}
			if (authorPopover) {
				authorPopover = null;
				e.stopPropagation();
			}
		}
	}

	// Dismiss selection bubble when the browser clears the selection (e.g. click elsewhere in preview).
	// Deferred to rAF so onclick handlers (e.g. "+Comment") run first and can set showNewComment = true.
	function onNativeSelectionChange() {
		requestAnimationFrame(() => {
			if (showNewComment || showSubnote) return;
			const sel = window.getSelection();
			if (!sel || sel.isCollapsed || !sel.toString().trim()) {
				if (showFloating) updateSelection(null as never);
			}
		});
	}

	// Dismiss paragraph comment on click outside
	let paragraphCommentEl = $state<HTMLElement | null>(null);
	function onPointerDownOutside(e: PointerEvent) {
		if (
			showNewParagraphComment &&
			paragraphCommentEl &&
			!paragraphCommentEl.contains(e.target as Node)
		) {
			showNewParagraphComment = false;
		}
	}

	$effect(() => {
		document.addEventListener('keydown', onDocKeydown);
		document.addEventListener('selectionchange', onNativeSelectionChange);
		document.addEventListener('pointerdown', onPointerDownOutside);
		return () => {
			document.removeEventListener('keydown', onDocKeydown);
			document.removeEventListener('selectionchange', onNativeSelectionChange);
			document.removeEventListener('pointerdown', onPointerDownOutside);
		};
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

		loadDocSubnotes();

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
					<span
						translate="no"
						class="truncate font-sans text-sm font-medium text-ink dark:text-dark-ink"
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
	<div class="hidden sm:flex sm:h-screen sm:flex-col">
		<!-- Sticky toolbar -->
		<div
			class="sticky top-0 z-10 flex flex-col border-b border-paper-border bg-paper/95 backdrop-blur-sm dark:border-dark-paper-border dark:bg-dark-paper/95"
		>
			<!-- Row 1: breadcrumb -->
			<div
				data-tutorial="doc-breadcrumb"
				class="flex min-w-0 items-center gap-2 border-b border-paper-border/50 px-6 py-2 font-sans text-sm dark:border-dark-paper-border/50"
			>
				<button
					translate="no"
					onclick={() => (window.location.href = `/projects/${data.document.projectId}`)}
					class="shrink-0 text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
				>
					{data.projectTitle}
				</button>
				<span class="text-ink-faint dark:text-dark-ink-faint">/</span>
				<span translate="no" class="truncate font-medium text-ink dark:text-dark-ink"
					>{docTitle}</span
				>

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
			<div data-tutorial="doc-toolbar" class="flex items-center gap-2 overflow-x-auto px-4 py-2">
				<!-- Reclaim writer (Delegate moved to project doc list) -->
				{#if reclaimCap.kind === 'available'}
					<button
						onclick={() => handleSetWriter(null)}
						disabled={delegating}
						title="Reclaim write access from {currentWriterName ?? currentWriterUserId}"
						class="flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 font-sans text-sm text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-40 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/40"
					>
						<svg
							width="13"
							height="13"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<polyline points="1 4 1 10 7 10" />
							<path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
						</svg>
						Reclaim
					</button>
				{/if}

				<!-- Release writer (downgraded writer yields their slot back to project owner) -->
				{#if releaseWriterCap.kind === 'available'}
					<button
						onclick={() => handleSetWriter(null)}
						disabled={delegating}
						title="Release write access — the project owner will regain control"
						class="flex items-center gap-1.5 rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui disabled:opacity-40 dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
					>
						<svg
							width="13"
							height="13"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
							<polyline points="16 17 21 12 16 7" />
							<line x1="21" y1="12" x2="9" y2="12" />
						</svg>
						Release writer
					</button>
				{/if}

				{#if !data.document.isReadonly}
					<button
						onclick={doSaveDraft}
						disabled={!isDirty || !canTriggerSave(saveCap)}
						title={saveCap.kind === 'queued'
							? saveCap.hint
							: saveCap.kind === 'blocked'
								? saveCap.reason
								: undefined}
						class="flex items-center gap-1.5 rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui disabled:opacity-40 dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
					>
						<svg
							width="13"
							height="13"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
							<polyline points="17 21 17 13 7 13 7 21" />
							<polyline points="7 3 7 8 15 8" />
						</svg>
						{saveCap.kind === 'saving'
							? 'Saving…'
							: saveCap.kind === 'queued'
								? 'Save offline'
								: 'Save'}
					</button>
				{/if}

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
					{#if !data.document.isReadonly && viewMode !== 'preview'}
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
							<path
								d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linejoin="round"
							/>
						</svg>
						Configure AI
					</a>
				{:else if aiCtaType === 'org-owner'}
					<a
						href="/settings?tab=organizations"
						class="flex items-center gap-1.5 rounded-md border border-dashed border-accent/40 px-3 py-1.5 font-sans text-xs font-medium text-accent transition-colors hover:border-accent hover:bg-accent/5"
					>
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path
								d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linejoin="round"
							/>
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
					title="Citation style — controls how @citeKey references render in preview"
					class="flex items-center gap-1 rounded-md border border-paper-border px-2.5 py-1.5 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
				>
					{CITATION_STYLE_LABELS[citationStyle]}
					<svg
						width="10"
						height="10"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg
					>
				</button>

				<button
					onclick={toggleComments}
					title="Toggle comment threads panel"
					class="relative flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-sans text-sm transition-colors {showComments
						? 'border-amber-400 bg-amber-400/10 text-amber-700 dark:text-amber-300'
						: 'border-paper-border text-ink-muted hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui'}"
				>
					<svg
						width="13"
						height="13"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
						<line x1="8" y1="9" x2="16" y2="9" />
						<line x1="8" y1="13" x2="13" y2="13" />
					</svg>
					Comments
					{#if openCommentsCount > 0}
						<span
							class="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 font-sans text-xs font-semibold text-white"
						>
							{openCommentsCount}
						</span>
					{/if}
				</button>

				{#if viewMode !== 'preview'}
					<button
						onclick={toggleBib}
						title="Bibliography panel — insert citations from your project references"
						class="flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-sans text-sm transition-colors {showBib
							? 'border-accent bg-accent/10 text-accent dark:bg-accent/20'
							: 'border-paper-border text-ink-muted hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui'}"
					>
						<svg
							width="13"
							height="13"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
							<path d="M6.5 2H20v20l-7-4-7 4V2z" />
						</svg>
						Bib
					</button>
				{/if}

				<!-- View mode selector (hidden for non-writers and published view) -->
				{#if canWrite && !data.forcePublished}
					<div
						class="flex overflow-hidden rounded-md border border-paper-border dark:border-dark-paper-border"
						role="group"
						aria-label="View mode"
					>
						<button
							onclick={() => setViewMode('editor')}
							title="Editor only"
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
							title="Editor and preview"
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
							title="Preview only"
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
					title="Version history — browse and restore past committed versions"
					class="flex items-center gap-1.5 rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
				>
					<svg
						width="13"
						height="13"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<circle cx="12" cy="12" r="10" />
						<polyline points="12 6 12 12 16 14" />
					</svg>
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

				{#if !data.document.isReadonly}
					<!-- Spell check button -->
					<button
						onclick={() => runSpellCheck()}
						disabled={spellLoading}
						title="Check spelling and grammar"
						class="flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-sans text-sm transition-colors {showSpellPanel
							? 'border-accent bg-accent text-white'
							: 'border-paper-border text-ink-muted hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui'} disabled:opacity-40"
					>
						<svg
							width="13"
							height="13"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<polyline points="4 7 4 4 20 4 20 7" />
							<line x1="9" y1="20" x2="15" y2="20" />
							<line x1="12" y1="4" x2="12" y2="20" />
						</svg>
						{spellLoading ? 'Checking…' : 'Spell'}
					</button>

					<!-- Grammar assistant button -->
					<button
						onclick={() => runGrammarCheck()}
						disabled={grammarLoading}
						title="Grammar and style suggestions for non-native English writers"
						class="flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-sans text-sm transition-colors {showGrammarPanel
							? 'border-accent bg-accent text-white'
							: 'border-paper-border text-ink-muted hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui'} disabled:opacity-40"
					>
						<svg
							width="13"
							height="13"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path d="M12 20h9" />
							<path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
						</svg>
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
				{/if}

				<!-- Export dropdown trigger only — menu rendered at root level to escape backdrop-filter -->
				<button
					onclick={(e) => {
						const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
						exportMenuPos = { top: rect.bottom + 4, left: rect.left };
						showExport = !showExport;
					}}
					title="Export document — PDF, DOCX, Markdown, and more"
					class="flex items-center gap-1 rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
				>
					Export
					<svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
						<path
							d="M2 3.5l3 3 3-3"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
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
						Private
					{/if}
				</button>

				{#if !data.document.isReadonly}
					<button
						onclick={() => (showCommit = true)}
						disabled={!canTriggerCommit(commitCap)}
						title={commitCap.kind === 'blocked'
							? commitCap.reason
							: 'Commit — save a named version and update the project timeline'}
						class="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
					>
						<svg
							width="13"
							height="13"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path
								d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"
							/>
							<line x1="7" y1="7" x2="7.01" y2="7" />
						</svg>
						Commit
					</button>
				{/if}
			</div>
		</div>

		{#snippet editableTitle()}
			<div class="mb-6">
				{#if sourceRefCitation}
					<div
						class="mb-3 flex items-start gap-2 rounded border border-paper-border bg-paper-ui px-3 py-2 dark:border-dark-paper-border dark:bg-dark-paper-ui"
					>
						<svg
							width="12"
							height="12"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="text-ink-light dark:text-dark-ink-light mt-0.5 shrink-0"
							aria-hidden="true"
						>
							<path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
							<path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
						</svg>
						<p
							class="text-ink-light dark:text-dark-ink-light font-sans text-xs leading-relaxed"
							translate="no"
						>
							{@html sourceRefCitation}
						</p>
					</div>
				{/if}
				{#if editingTitle}
					<input
						bind:this={titleInputEl}
						translate="no"
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
						translate="no"
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
		<div data-tutorial="doc-editor-area" class="flex min-h-0 flex-1 overflow-hidden">
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
									onauthorhover={(name, coords) => showAuthorInfo(name, coords)}
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
								<p class="-mt-4 mb-6 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
									{#if data.document.lastCommit.committerName}
										{data.document.lastCommit.committerName} ·
									{/if}
									{new Date(data.document.lastCommit.committedAt).toLocaleDateString(undefined, {
										year: 'numeric',
										month: 'short',
										day: 'numeric'
									})}
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
									preRenderedHtml={data.renderedHtml ?? undefined}
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
								{spellLanguage}
							/>
						{/if}
					</div>
				</div>
			{/if}

			<SelectionOverlays
				{showFloating}
				{currentSelection}
				{projectRefs}
				{sourceReference}
				{hasAiKey}
				{reviewTypeLabels}
				documentId={data.document.id}
				currentUserId={data.currentUserId}
				currentUserName={(data as any).user?.name ?? null}
				{content}
				bind:showNewComment
				bind:showSubnote
				bind:showReviewTypeMenu
				bind:showComments
				bind:showHistory
				bind:selectionReview
				bind:authorPopover
				bind:headingTooltip
				bind:showNewParagraphComment
				bind:pendingParagraphNumber
				bind:paragraphCommentPos
				bind:paragraphCommentEl
				oncommentcreated={(comment) => {
					inlineComments = [...inlineComments, comment].sort(
						(a, b) => (a.characterStart ?? 0) - (b.characterStart ?? 0)
					);
				}}
				onannotationcreated={loadDocSubnotes}
				onparagraphcommentcreated={(comment) => {
					inlineComments = [...inlineComments, comment];
				}}
				onscrolltocite={scrollEditorToCiteKey}
				onreviewselection={(type) => runReviewSelection(type as ReviewType)}
				onspellcheck={(text, offset) => {
					showFloating = false;
					runSpellCheck({ text, offset });
				}}
				onacceptreview={acceptSelectionReview}
				ongetparagraphtext={(n) =>
					previewRef?.getParagraphText(n) ?? splitPreviewRef?.getParagraphText(n)}
				onclearselection={() => {
					currentSelection = null;
				}}
			/>
			<!-- Comments sidebar -->
			{#if showComments}
				<CommentsPanel
					comments={inlineComments}
					activeCommentId={currentCommentId}
					currentUserId={data.currentUserId}
					{chapters}
					onlookup={lookupNames}
					oncommentclick={handleCommentClick}
					onresolved={handleCommentResolved}
					onreopened={handleCommentReopened}
					onreplyadded={handleReplyAdded}
					ondeleted={(id) => {
						inlineComments = inlineComments.filter((x) => x.id !== id);
					}}
				/>
			{/if}

			<!-- Annotations panel (subnotes for source-reference docs) -->
			{#if data.document.isReadonly}
				<AnnotationsPanel
					subnotes={docSubnotes}
					{sourceReference}
					{projectRefs}
					onscrolltoannotation={scrollToAnnotation}
					onloadrefs={loadRefs}
					onassignreference={async (refId) => {
						await trpc.documents.setSourceReference.mutate({
							documentId: data.document.id,
							referenceId: refId
						});
						const ref = projectRefs.find((r) => r.id === refId);
						if (ref) sourceReference = { id: ref.id!, citeKey: ref.citeKey };
						await loadDocSubnotes();
					}}
					onsavesubnote={async (id, notes) => {
						await trpc.references.updateSubnote.mutate({ id, notes });
						docSubnotes = docSubnotes.map((s) =>
							s.id === id ? { ...s, notes, updatedAt: new Date() } : s
						);
					}}
					ondeletesubnote={async (id) => {
						await trpc.references.deleteSubnote.mutate({ id });
						docSubnotes = docSubnotes.filter((s) => s.id !== id);
					}}
				/>
			{/if}

			<!-- Bibliography panel -->
			{#if showBib && viewMode !== 'preview'}
				<BibliographyPanel
					refs={projectRefs}
					activeKey={activeBibCiteKey}
					bind:filter={bibFilter}
					onscrolltocite={scrollEditorToCiteKey}
					oninsert={(key) => editorEl?.insertAtCursor(`[[@${key}]]`)}
				/>
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
				<div
					class="flex w-72 shrink-0 flex-col overflow-hidden border-l border-paper-border dark:border-dark-paper-border"
				>
					<SpellCheckPanel
						bind:corrections={spellCorrections}
						loading={spellLoading}
						documentText={content}
						onaccept={applySpellCorrection}
						onignore={ignoreSpellWord}
						onclose={() => {
							showSpellPanel = false;
							spellCorrections = [];
							editorEl?.clearSpellHover();
						}}
						onhover={(c) => editorEl?.setSpellHover(c.from, c.to)}
						onhoverend={() => editorEl?.clearSpellHover()}
					/>
				</div>
			{/if}

			<!-- Grammar assistant sidebar -->
			{#if showGrammarPanel}
				<div
					class="flex w-72 shrink-0 flex-col overflow-hidden border-l border-paper-border dark:border-dark-paper-border"
				>
					<SpellCheckPanel
						bind:corrections={grammarCorrections}
						loading={grammarLoading}
						mode="grammar"
						documentText={content}
						onaccept={applyGrammarCorrection}
						onignore={async () => {}}
						onclose={() => {
							showGrammarPanel = false;
							grammarCorrections = [];
							editorEl?.clearSpellHover();
						}}
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
						{spellLanguage}
						onApplyEdit={(action) => {
							if (action.type === 'replace_text') {
								const idx = content.indexOf(action.anchorText);
								if (idx !== -1)
									content =
										content.slice(0, idx) +
										action.replacement +
										content.slice(idx + action.anchorText.length);
							} else if (action.type === 'insert_after') {
								const idx = content.indexOf(action.anchorText);
								if (idx !== -1)
									content =
										content.slice(0, idx + action.anchorText.length) +
										'\n\n' +
										action.content +
										content.slice(idx + action.anchorText.length);
							}
						}}
						onClose={toggleChat}
						orgId={data.projectOrgId}
					/>
				</div>
			{/if}

			<!-- Review sidebar -->
			{#if showReview}
				<ReviewPanel
					projectId={data.document.projectId}
					documentId={data.document.id}
					{hasAiKey}
					onclose={toggleReview}
					oninsertcitation={(citeKey) => editorEl?.insertAtCursor(`[[@${citeKey}]]`)}
				/>
			{/if}

			<!-- Enrich sidebar -->
			{#if showEnrich}
				<EnrichPanel
					projectId={data.document.projectId}
					documentId={data.document.id}
					{content}
					onclose={toggleEnrich}
					onapplyperson={(name) => {
						const token = `[[person:${name}]]`;
						const re = new RegExp(
							`(?<!\\[\\[person:)\\b${name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b(?![^\\[]*\\]\\])`,
							'g'
						);
						content = content.replace(re, token);
					}}
					oapplyref={(ctx, text, citeKey) => {
						const ctxIdx = content.indexOf(ctx);
						if (ctxIdx !== -1) {
							const textIdx = content.indexOf(text, ctxIdx);
							if (textIdx !== -1 && textIdx < ctxIdx + ctx.length)
								content =
									content.slice(0, textIdx) +
									`[[@${citeKey}]]` +
									content.slice(textIdx + text.length);
						} else {
							content = content.replace(text, `[[@${citeKey}]]`);
						}
					}}
				/>
			{/if}

			<!-- Draft assistant sidebar -->
			{#if showDraft}
				<DraftPanel
					projectId={data.document.projectId}
					onclose={toggleDraft}
					ongetselection={() => editorEl?.getSelection() ?? null}
					oninsertcursor={(text) => editorEl?.insertAtCursor(text)}
					onreplacerange={(from, to, text) => editorEl?.replaceRange(from, to, text)}
				/>
			{/if}

			<!-- Version history sidebar -->
			{#if showHistory}
				<VersionHistoryPanel
					documentId={data.document.id}
					projectId={data.document.projectId}
					onclose={toggleHistory}
					onrestore={(restoredContent) => {
						content = restoredContent;
						lastSavedContent = restoredContent;
						saveStatus = 'pending';
						if (autoSaveTimer) clearTimeout(autoSaveTimer);
						autoSaveTimer = setTimeout(doSaveDraft, 30_000);
					}}
				/>
			{/if}
		</div>

		<!-- Cite picker modal -->
		{#if showCitePicker}
			<CitePicker
				refs={projectRefs}
				{refsLoaded}
				projectId={data.document.projectId}
				onclose={() => (showCitePicker = false)}
				oninsert={(ref) => {
					editorEl?.insertAtCursor(`[[@${ref.citeKey}]]`);
					showCitePicker = false;
				}}
			/>
		{/if}

		<!-- Commit dialog -->
		{#if showCommit}
			<CommitDialog
				documentId={data.document.id}
				{isDirty}
				ondosave={doSaveDraft}
				oncommitted={() => {
					lastSavedContent = content;
					saveStatus = 'idle';
					showCommit = false;
				}}
				onclose={() => (showCommit = false)}
			/>
		{/if}
	</div>
	<!-- end desktop editor wrapper -->
{/if}

<TutorialManager
	slug="document"
	completedTutorials={data.completedTutorials}
	steps={documentTutorialSteps}
	minWidth={640}
/>

<!-- Floating dropdown menus — rendered at root level to escape backdrop-filter containing block -->
{#if showCiteStyleMenu}
	<button
		class="fixed inset-0 z-10"
		onclick={() => (showCiteStyleMenu = false)}
		aria-label="Close menu"
		tabindex="-1"
	></button>
	<div
		class="fixed z-20 w-28 overflow-hidden rounded-md border border-paper-border bg-paper shadow-lg dark:border-dark-paper-border dark:bg-dark-paper"
		style="top: {citeStyleMenuPos.top}px; left: {citeStyleMenuPos.left}px;"
	>
		{#each Object.entries(CITATION_STYLE_LABELS) as [s, label] (s)}
			<button
				onclick={() => {
					setCitationStyle(s as CitationStyle);
					showCiteStyleMenu = false;
				}}
				class="flex w-full items-center justify-between px-3 py-2 font-sans text-xs transition-colors hover:bg-paper-ui dark:hover:bg-dark-paper-ui {citationStyle ===
				s
					? 'font-semibold text-accent'
					: 'text-ink-muted dark:text-dark-ink-muted'}"
			>
				{label}
				{#if citationStyle === s}
					<svg
						width="10"
						height="10"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="3"
						aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg
					>
				{/if}
			</button>
		{/each}
	</div>
{/if}

{#if showExport}
	<button
		class="fixed inset-0 z-10"
		onclick={() => (showExport = false)}
		aria-label="Close menu"
		tabindex="-1"
	></button>
	<div
		class="fixed z-20 w-44 overflow-hidden rounded-xl border border-paper-border bg-paper shadow-lg dark:border-dark-paper-border dark:bg-dark-paper"
		style="top: {exportMenuPos.top}px; left: {exportMenuPos.left}px;"
	>
		<a
			href="/api/projects/{data.document?.projectId}/documents/{data.document
				?.id}/export?format=latex"
			onclick={() => (showExport = false)}
			class="flex items-center gap-2.5 px-4 py-2.5 font-sans text-sm text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
		>
			<span class="font-mono text-xs text-ink-faint dark:text-dark-ink-faint">.tex</span>LaTeX
		</a>
		<a
			href="/api/projects/{data.document?.projectId}/documents/{data.document
				?.id}/export?format=typst"
			onclick={() => (showExport = false)}
			class="flex items-center gap-2.5 px-4 py-2.5 font-sans text-sm text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
		>
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
		if (e.key === 'Escape') {
			showCheatsheet = false;
			showCiteStyleMenu = false;
		}
	}}
	onclick={() => {
		showCiteStyleMenu = false;
	}}
/>

{#if showCheatsheet}
	<MarkdownCheatsheet onclose={() => (showCheatsheet = false)} />
{/if}

<!-- ── Writer lost modal ── -->
{#if writerLostContent !== null}
	<WriterLostModal
		content={writerLostContent}
		documentId={data.document.id}
		onclose={() => (writerLostContent = null)}
	/>
{/if}
