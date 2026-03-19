<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import MarkdownEditor from '$lib/components/editor/MarkdownEditor.svelte';
	import DiffViewer from '$lib/components/editor/DiffViewer.svelte';
	import CommentThread from '$lib/components/editor/CommentThread.svelte';
	import { trpc } from '$lib/utils/trpc';
	import { findAnchor, posToLine, type CommentRange } from '$lib/components/editor/commentsExtension';
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
	type Reply = { id: string; parentCommentId: string | null; authorId: string; authorName: string; content: string; createdAt: Date };
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

	const saveStatusLabel: Record<typeof saveStatus, string> = {
		idle: '',
		pending: 'Cambios sin guardar',
		saving: 'Guardando...',
		saved: 'Guardado',
		error: 'Error al guardar'
	};

	const openCommentsCount = $derived(inlineComments.filter((c) => c.status === 'open').length);

	onDestroy(() => {
		if (autoSaveTimer) clearTimeout(autoSaveTimer);
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
			onclick={toggleHistory}
			class="rounded-md border px-3 py-1.5 font-sans text-sm transition-colors {showHistory
				? 'border-accent bg-accent text-white'
				: 'border-paper-border text-ink-muted hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui'}"
		>
			Historial
		</button>

		<button
			onclick={() => (showCommit = true)}
			disabled={!isDirty}
			class="rounded-md bg-accent px-3 py-1.5 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
		>
			Commit
		</button>
	</div>
</div>

<!-- Main layout -->
<div class="flex overflow-hidden" style="height: calc(100vh - 57px)">
	<!-- Editor -->
	<div class="relative flex-1 overflow-y-auto px-6 py-10">
		<div class="mx-auto w-full max-w-2xl">
			<MarkdownEditor
				bind:value={content}
				ondocchange={handleDocChange}
				onselectionchange={(sel) => {
					currentSelection = sel;
					if (!sel) showNewComment = false;
				}}
				{commentRanges}
				{scrollToRange}
			/>
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
