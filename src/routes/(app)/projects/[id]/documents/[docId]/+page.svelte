<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import MarkdownEditor from '$lib/components/editor/MarkdownEditor.svelte';
	import MarkdownPreview from '$lib/components/editor/MarkdownPreview.svelte';
	import DiffViewer from '$lib/components/editor/DiffViewer.svelte';
	import CommentThread from '$lib/components/editor/CommentThread.svelte';
	import { trpc } from '$lib/utils/trpc';
	import { findAnchor, posToLine, type CommentRange } from '$lib/components/editor/commentsExtension';
	import { CITATION_STYLE_LABELS, type CitationStyle, type CiteRef } from '$lib/utils/citations';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// untrack: read from props once without creating a reactive dependency
	let content = $state(untrack(() => data.document.content));
	let lastSavedContent = $state(untrack(() => data.document.content));
	const isDirty = $derived(content !== lastSavedContent);
	let saveStatus: 'idle' | 'pending' | 'saving' | 'saved' | 'error' = $state(
		untrack(() => (data.document.hasDraft ? 'pending' : 'idle'))
	);

	let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

	// Preview mode
	let showPreview = $state(false);

	// Citations
	let citationStyle = $state<CitationStyle>('apa');
	let projectRefs = $state<CiteRef[]>([]);
	let refsLoaded = $state(false);
	let showCitePicker = $state(false);
	let citeSearch = $state('');
	let editorEl: { insertAtCursor: (text: string) => void } | null = $state(null);

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
		const stored = localStorage.getItem(`cite-style-${data.document.id}`);
		if (stored && (stored === 'apa' || stored === 'ieee' || stored === 'vancouver')) {
			citationStyle = stored as CitationStyle;
		}
	});

	function setCitationStyle(s: CitationStyle) {
		citationStyle = s;
		localStorage.setItem(`cite-style-${data.document.id}`, s);
	}

	// Load refs when preview is opened
	$effect(() => {
		if (showPreview) loadRefs();
	});

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
	let compareContent: string | null = $state(null);
	let loadingCompare = $state(false);

	// Commit dialog
	let showCommit = $state(false);
	let commitMessage = $state('');
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
	let inlineComments: InlineComment[] = $state(untrack(() => data.inlineComments as InlineComment[]));

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
		if (aiEnabled) {
			if (aiSuggestTimer) clearTimeout(aiSuggestTimer);
			aiSuggestTimer = setTimeout(triggerSuggestions, 4_000);
		}
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
			commitError = e instanceof Error ? e.message : 'Error al crear versión';
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
			compareContent = null;
		}
	}

	function toggleComments() {
		showComments = !showComments;
		if (showComments) showHistory = false;
	}

	async function selectVersion(versionId: string) {
		if (selectedVersionId === versionId) {
			selectedVersionId = null;
			compareContent = null;
			return;
		}
		selectedVersionId = versionId;
		loadingCompare = true;
		try {
			const v = await trpc.documents.versionContent.query(versionId);
			compareContent = v.content;
		} finally {
			loadingCompare = false;
		}
	}

	async function restoreVersion(versionId: string) {
		if (compareContent === null) return;
		await trpc.documents.restoreVersion.mutate({ documentId: data.document.id, versionId });
		content = compareContent;
		lastSavedContent = compareContent;
		saveStatus = 'pending';
		selectedVersionId = null;
		compareContent = null;
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
		pending: 'Cambios sin guardar',
		saving: 'Guardando...',
		saved: 'Guardado',
		error: 'Error al guardar'
	};

	const openCommentsCount = $derived(inlineComments.filter((c) => c.status === 'open').length);

	// ── AI suggestions ──────────────────────────────────────────────────────────
	type Suggestion = { id: string; originalText: string; suggestedText: string; explanation: string };

	let aiEnabled = $state(false);
	let showSuggestions = $state(false);
	let suggestions = $state<Suggestion[]>([]);
	let loadingSuggestions = $state(false);
	let aiSuggestTimer: ReturnType<typeof setTimeout> | null = null;
	let lastSuggestedContent = $state(''); // content snapshot at last API call

	function wordCount(text: string) {
		return text.trim().split(/\s+/).filter(Boolean).length;
	}

	function isCandidate(current: string): boolean {
		const words = wordCount(current);
		if (words < 100) return false;
		const delta = Math.abs(wordCount(current) - wordCount(lastSuggestedContent));
		return delta >= 30;
	}

	// Persist toggle preference in localStorage
	$effect(() => {
		aiEnabled = localStorage.getItem(`ai-suggestions-${data.document.id}`) === 'true';
	});

	function toggleAI() {
		aiEnabled = !aiEnabled;
		localStorage.setItem(`ai-suggestions-${data.document.id}`, String(aiEnabled));
		if (aiEnabled) {
			showSuggestions = true;
			showHistory = false;
			showComments = false;
		} else {
			showSuggestions = false;
			suggestions = [];
			if (aiSuggestTimer) clearTimeout(aiSuggestTimer);
		}
	}

	async function triggerSuggestions() {
		if (!aiEnabled || !isCandidate(content)) return;
		lastSuggestedContent = content;
		loadingSuggestions = true;
		try {
			const result = await trpc.ai.suggest.mutate({
				projectId: data.document.projectId,
				content
			});
			suggestions = result;
		} catch {
			// Silently ignore — suggestions are non-intrusive
		} finally {
			loadingSuggestions = false;
		}
	}

	function applySuggestion(s: Suggestion) {
		content = content.replace(s.originalText, s.suggestedText);
		saveStatus = 'pending';
		suggestions = suggestions.filter((x) => x.id !== s.id);
	}

	function dismissSuggestion(id: string) {
		suggestions = suggestions.filter((s) => s.id !== id);
	}

	onDestroy(() => {
		if (autoSaveTimer) clearTimeout(autoSaveTimer);
		if (aiSuggestTimer) clearTimeout(aiSuggestTimer);
	});
</script>

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
			Guardar
		</button>

		<!-- AI suggestions toggle -->
		<button
			type="button"
			onclick={toggleAI}
			title={aiEnabled ? 'Desactivar sugerencias IA' : 'Activar sugerencias IA'}
			class="flex items-center gap-2 rounded-md border px-3 py-1.5 font-sans text-sm transition-colors {aiEnabled
				? 'border-accent bg-accent/10 text-accent dark:border-accent dark:text-accent'
				: 'border-paper-border text-ink-muted hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui'}"
		>
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
			</svg>
			IA
			<!-- pill switch -->
			<span class="relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors {aiEnabled ? 'bg-accent' : 'bg-paper-border dark:bg-dark-paper-border'}">
				<span class="inline-block h-3 w-3 rounded-full bg-white shadow transition-transform {aiEnabled ? 'translate-x-3.5' : 'translate-x-0.5'}"></span>
			</span>
		</button>

		<!-- Citar button -->
		{#if !showPreview}
			<button
				onclick={openCitePicker}
				title="Insertar cita bibliográfica"
				class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
			>
				[@cite]
			</button>
		{/if}

		<!-- Citation style selector (only visible in preview) -->
		{#if showPreview}
			<div class="flex rounded-md border border-paper-border overflow-hidden dark:border-dark-paper-border">
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
			Comentarios
			{#if openCommentsCount > 0}
				<span
					class="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 font-sans text-xs font-semibold text-white"
				>
					{openCommentsCount}
				</span>
			{/if}
		</button>

		<button
			onclick={() => (showPreview = !showPreview)}
			class="rounded-md border px-3 py-1.5 font-sans text-sm transition-colors {showPreview
				? 'border-accent bg-accent text-white'
				: 'border-paper-border text-ink-muted hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui'}"
		>
			Vista previa
		</button>

		<button
			onclick={toggleHistory}
			class="rounded-md border px-3 py-1.5 font-sans text-sm transition-colors {showHistory
				? 'border-accent bg-accent text-white'
				: 'border-paper-border text-ink-muted hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui'}"
		>
			Historial
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

<!-- Main layout -->
<div class="flex overflow-hidden" style="height: calc(100vh - 57px)">
	<!-- Editor / Preview -->
	<div class="relative flex-1 overflow-y-auto px-6 py-10">
		<div class="mx-auto w-full max-w-2xl">
			{#if showPreview}
				<MarkdownPreview
					{content}
					projectId={data.document.projectId}
					references={projectRefs}
					{citationStyle}
				/>
			{:else}
				<MarkdownEditor
					bind:this={editorEl}
					bind:value={content}
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
					+ Comentar
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
						placeholder="Escribe tu comentario…"
						class="w-full resize-none rounded-md border border-paper-border bg-paper-ui px-2 py-1.5 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
					></textarea>
					<div class="mt-2 flex gap-2">
						<button
							onclick={submitComment}
							disabled={submittingComment || !newCommentText.trim()}
							class="flex-1 rounded-md bg-accent py-1.5 font-sans text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
						>
							{submittingComment ? 'Guardando…' : 'Comentar'}
						</button>
						<button
							onclick={() => {
								showNewComment = false;
								newCommentText = '';
							}}
							class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted"
						>
							Cancelar
						</button>
					</div>
				</div>
			</div>
		{/if}
	</div>

	<!-- Comments sidebar -->
	{#if showComments}
		<div
			class="flex w-80 shrink-0 flex-col overflow-hidden border-l border-paper-border bg-paper dark:border-dark-paper-border dark:bg-dark-paper"
		>
			<div
				class="flex items-center justify-between border-b border-paper-border px-4 py-3 dark:border-dark-paper-border"
			>
				<h3 class="font-serif text-sm font-semibold text-ink dark:text-dark-ink">Comentarios</h3>
				<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
					{openCommentsCount} abierto{openCommentsCount !== 1 ? 's' : ''}
				</span>
			</div>

			<div class="flex-1 space-y-2 overflow-y-auto p-3">
				{#if inlineComments.length === 0}
					<p class="px-1 py-6 text-center font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
						Sin comentarios aún.<br />
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
						/>
					{/each}
				{/if}
			</div>
		</div>
	{/if}

	<!-- AI suggestions sidebar -->
	{#if showSuggestions && aiEnabled}
		<div class="flex w-80 shrink-0 flex-col overflow-hidden border-l border-paper-border bg-paper dark:border-dark-paper-border dark:bg-dark-paper">
			<div class="flex items-center justify-between border-b border-paper-border px-4 py-3 dark:border-dark-paper-border">
				<h3 class="font-serif text-sm font-semibold text-ink dark:text-dark-ink">Sugerencias IA</h3>
				{#if loadingSuggestions}
					<div class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
				{:else}
					<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
						{suggestions.length} sugerencia{suggestions.length !== 1 ? 's' : ''}
					</span>
				{/if}
			</div>

			<div class="flex-1 overflow-y-auto p-3">
				{#if !loadingSuggestions && suggestions.length === 0}
					<p class="px-1 py-6 text-center font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
						Sin sugerencias.<br />
						<span class="text-xs text-ink-faint dark:text-dark-ink-faint">
							Se generan automáticamente al escribir.
						</span>
					</p>
				{:else}
					<div class="flex flex-col gap-3">
						{#each suggestions as s (s.id)}
							<div class="rounded-xl border border-accent/20 bg-accent/5 p-3">
								<!-- Original → suggested -->
								<div class="mb-2 space-y-1 rounded-md bg-paper px-2.5 py-2 font-mono text-xs dark:bg-dark-paper">
									<p class="text-red-500 line-through opacity-70">{s.originalText}</p>
									<p class="text-green-600 dark:text-green-400">{s.suggestedText}</p>
								</div>
								<!-- Explanation -->
								<p class="mb-3 font-sans text-xs leading-relaxed text-ink-muted dark:text-dark-ink-muted">
									{s.explanation}
								</p>
								<!-- Actions -->
								<div class="flex gap-2">
									<button
										type="button"
										onclick={() => applySuggestion(s)}
										class="flex-1 rounded-md bg-accent py-1.5 font-sans text-xs font-medium text-white transition-colors hover:bg-accent-hover"
									>
										Aplicar
									</button>
									<button
										type="button"
										onclick={() => dismissSuggestion(s.id)}
										class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted"
									>
										×
									</button>
								</div>
							</div>
						{/each}
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
					Historial de versiones
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
						Sin versiones guardadas aún.
					</div>
				{:else}
					<ul class="divide-y divide-paper-border dark:divide-dark-paper-border">
						{#each versions as v (v.id)}
							<li class="px-4 py-3">
								<div class="flex items-start justify-between gap-2">
									<div class="min-w-0">
										<p class="font-sans text-xs font-semibold text-accent">v{v.versionNumber}</p>
										<p class="mt-0.5 truncate font-sans text-sm text-ink dark:text-dark-ink">
											{v.changeDescription ?? 'Sin descripción'}
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
											onclick={() => selectVersion(v.id)}
											class="rounded px-2 py-1 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui {selectedVersionId ===
											v.id
												? 'bg-paper-ui dark:bg-dark-paper-ui'
												: ''}"
										>
											{selectedVersionId === v.id ? 'Cerrar' : 'Comparar'}
										</button>
										{#if selectedVersionId === v.id && compareContent !== null}
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
										{:else if compareContent !== null}
											<DiffViewer
												oldText={compareContent}
												newText={content}
												oldLabel="v{v.versionNumber}"
												newLabel="Actual"
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
					placeholder="Buscar por autor, título o clave…"
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
							Ir a Bibliografía →
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
			<h2 class="font-serif text-xl font-semibold text-ink dark:text-dark-ink">Crear versión</h2>
			<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				Describe los cambios de esta versión.
			</p>

			<div class="mt-4 flex flex-col gap-3">
				<textarea
					bind:value={commitMessage}
					rows={3}
					placeholder="Ej: Revisión de la introducción y ajuste de hipótesis"
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
						{committing ? 'Guardando versión...' : 'Crear versión'}
					</button>
					<button
						onclick={() => {
							showCommit = false;
							commitMessage = '';
							commitError = '';
						}}
						class="rounded-md border border-paper-border px-4 py-2.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted"
					>
						Cancelar
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
