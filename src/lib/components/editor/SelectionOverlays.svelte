<script lang="ts">
	import { trpc } from '$lib/utils/trpc';
	import { posToLine } from '$lib/components/editor/commentsExtension';
	import type { CiteRef } from '$lib/utils/citations';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	type Selection = {
		text: string;
		from: number;
		to: number;
		coords: { top: number; bottom: number; left: number; right: number } | null;
	};

	type SelectionReview = {
		from: number;
		to: number;
		coords: { bottom: number; left: number };
		reviewType: string;
		loading: boolean;
		suggestion: string;
		explanation: string;
	} | null;

	type AuthorPopover = {
		name: string;
		coords: { bottom: number; left: number };
		refs: CiteRef[];
	} | null;

	type HeadingTooltip = {
		title: string;
		wordCount: number;
		coords: { bottom: number; left: number };
	} | null;

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

	let {
		showFloating,
		currentSelection,
		projectRefs,
		sourceReference,
		hasAiKey,
		reviewTypeLabels,
		documentId,
		currentUserId,
		currentUserName,
		content,
		showNewComment = $bindable(false),
		showSubnote = $bindable(false),
		showReviewTypeMenu = $bindable(false),
		showComments = $bindable(false),
		showHistory = $bindable(false),
		selectionReview = $bindable<SelectionReview>(null),
		authorPopover = $bindable<AuthorPopover>(null),
		headingTooltip = $bindable<HeadingTooltip>(null),
		showNewParagraphComment = $bindable(false),
		pendingParagraphNumber = $bindable<number | null>(null),
		paragraphCommentPos = $bindable({ top: 0, right: 0 }),
		paragraphCommentEl = $bindable<HTMLElement | null>(null),
		oncommentcreated,
		onannotationcreated,
		onparagraphcommentcreated,
		onscrolltocite,
		onreviewselection,
		onspellcheck,
		onacceptreview,
		ongetparagraphtext,
		onclearselection
	}: {
		showFloating: boolean;
		currentSelection: Selection | null;
		projectRefs: CiteRef[];
		sourceReference: { id: string; citeKey: string } | null;
		hasAiKey: boolean;
		reviewTypeLabels: Record<string, string>;
		documentId: string;
		currentUserId: string;
		currentUserName: string | null;
		content: string;
		showNewComment?: boolean;
		showSubnote?: boolean;
		showReviewTypeMenu?: boolean;
		showComments?: boolean;
		showHistory?: boolean;
		selectionReview?: SelectionReview;
		authorPopover?: AuthorPopover;
		headingTooltip?: HeadingTooltip;
		showNewParagraphComment?: boolean;
		pendingParagraphNumber?: number | null;
		paragraphCommentPos?: { top: number; right: number };
		paragraphCommentEl?: HTMLElement | null;
		oncommentcreated: (comment: InlineComment) => void;
		onannotationcreated: () => void;
		onparagraphcommentcreated: (comment: InlineComment) => void;
		onscrolltocite: (citeKey: string) => void;
		onreviewselection: (type: string) => void;
		onspellcheck: (text: string, offset: number) => void;
		onacceptreview: () => void;
		ongetparagraphtext: (n: number) => string | undefined;
		onclearselection: () => void;
	} = $props();

	let savedCommentSelection = $state<Selection | null>(null);
	let newCommentText = $state('');
	let submittingComment = $state(false);

	let subnoteSlug = $state('');
	let subnoteNotes = $state('');
	let subnoteRefId = $state('');
	let submittingSubnote = $state(false);
	let subnoteError = $state('');

	let paragraphCommentText = $state('');
	let submittingParagraphComment = $state(false);

	$effect(() => {
		if (!showNewParagraphComment) paragraphCommentText = '';
	});

	function slugify(text: string): string {
		return (
			text
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-|-$/g, '')
				.slice(0, 50) || 'note'
		);
	}

	function focusOnMount(node: HTMLElement) {
		node.focus();
	}

	function extractParagraph(md: string, from: number): string {
		let start = from;
		while (start > 0 && !(md[start - 1] === '\n' && (start < 2 || md[start - 2] === '\n'))) {
			start--;
		}
		let end = from;
		while (end < md.length && !(md[end] === '\n' && end + 1 < md.length && md[end + 1] === '\n')) {
			end++;
		}
		return md.slice(start, end).trim();
	}

	async function submitComment() {
		const sel = savedCommentSelection ?? currentSelection;
		if (!sel || !newCommentText.trim()) return;
		submittingComment = true;
		try {
			const lineStart = posToLine(content, sel.from);
			const lineEnd = posToLine(content, sel.to);
			const anchorContext = extractParagraph(content, sel.from);
			const created = await trpc.comments.createInline.mutate({
				documentId,
				content: newCommentText.trim(),
				anchorText: sel.text,
				anchorContext: anchorContext || undefined,
				lineStart,
				lineEnd,
				characterStart: sel.from,
				characterEnd: sel.to,
				paragraphNumber: undefined
			});

			const newComment: InlineComment = {
				id: created.id,
				authorId: created.authorId,
				authorName: currentUserId === created.authorId ? (currentUserName ?? '') : '',
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

			oncommentcreated(newComment);
			newCommentText = '';
			showNewComment = false;
			savedCommentSelection = null;
			onclearselection();
			showComments = true;
		} finally {
			submittingComment = false;
		}
	}

	async function submitSubnote() {
		if (!subnoteRefId || !subnoteSlug.trim() || !subnoteNotes.trim()) return;
		submittingSubnote = true;
		subnoteError = '';
		const anchorText = savedCommentSelection?.text ?? currentSelection?.text ?? null;
		try {
			await trpc.references.addSubnote.mutate({
				referenceId: subnoteRefId,
				slug: subnoteSlug.trim(),
				notes: subnoteNotes.trim(),
				anchorText: anchorText ?? undefined
			});
			showSubnote = false;
			savedCommentSelection = null;
			subnoteSlug = '';
			subnoteNotes = '';
			subnoteRefId = '';
			onannotationcreated();
		} catch (e) {
			subnoteError = e instanceof Error ? e.message : 'Error saving subnote.';
		} finally {
			submittingSubnote = false;
		}
	}

	async function submitParagraphComment() {
		if (!pendingParagraphNumber || !paragraphCommentText.trim()) return;
		submittingParagraphComment = true;
		try {
			const paragraphText = ongetparagraphtext(pendingParagraphNumber);
			const created = await trpc.comments.createInline.mutate({
				documentId,
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
				authorName: currentUserId === created.authorId ? (currentUserName ?? '') : '',
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

			onparagraphcommentcreated(newComment);
			paragraphCommentText = '';
			showNewParagraphComment = false;
			pendingParagraphNumber = null;
			showComments = true;
		} catch (e) {
			console.error('Failed to submit paragraph comment', e);
		} finally {
			submittingParagraphComment = false;
		}
	}
</script>

<!-- Floating action buttons on selection -->
{#if showFloating && currentSelection && currentSelection.coords && !showNewComment}
	<div
		class="pointer-events-none fixed z-20 flex gap-1.5"
		style="top: {currentSelection.coords.bottom + 8}px; left: {currentSelection.coords.left}px;"
	>
		<button
			class="pointer-events-auto rounded-md bg-amber-400 px-3 py-1.5 font-sans text-xs font-semibold text-white shadow-md transition-colors hover:bg-amber-500"
			onclick={() => {
				savedCommentSelection = currentSelection;
				showNewComment = true;
				showComments = true;
				showHistory = false;
			}}
		>
			+ Comment
		</button>
		{#if projectRefs.length > 0}
			<button
				class="pointer-events-auto rounded-md border border-paper-border bg-paper px-3 py-1.5 font-sans text-xs font-semibold text-ink shadow-md transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink dark:hover:bg-dark-paper-ui"
				onclick={() => {
					savedCommentSelection = currentSelection;
					subnoteNotes = '';
					subnoteSlug = slugify(currentSelection?.text?.slice(0, 40) ?? '');
					subnoteRefId =
						sourceReference?.id ?? (projectRefs.length === 1 ? (projectRefs[0].id ?? '') : '');
					subnoteError = '';
					showSubnote = true;
				}}
			>
				+ Annotation
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
								onclick={() => onreviewselection(type)}
							>
								{label}
							</button>
						{/each}
					</div>
				{/if}
			</div>
			<button
				class="hover:bg-paper-muted dark:hover:bg-dark-paper-muted pointer-events-auto rounded-md border border-paper-border bg-paper px-3 py-1.5 font-sans text-xs font-semibold text-ink shadow-md transition-colors dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
				onclick={() => {
					onspellcheck(currentSelection!.text, currentSelection!.from);
				}}
			>
				Spell
			</button>
		{/if}
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
						<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">Reviewing…</span
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
							onclick={onacceptreview}
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

<!-- Author info popover (bibliography-based) -->
{#if authorPopover && authorPopover.coords}
	<div class="fixed inset-0 z-20" onclick={() => (authorPopover = null)} aria-hidden="true"></div>
	<div
		class="pointer-events-none fixed z-20"
		style="top: {authorPopover.coords.bottom + 8}px; left: {authorPopover.coords.left}px;"
	>
		<div
			class="pointer-events-auto w-72 rounded-lg border border-paper-border bg-paper shadow-lg dark:border-dark-paper-border dark:bg-dark-paper"
		>
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
			{#if authorPopover.refs.length === 0}
				<p class="px-3 py-2.5 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
					Not in project bibliography.
				</p>
			{:else}
				<div class="space-y-0.5 p-1.5">
					{#each authorPopover.refs as ref}
						<button
							onclick={() => {
								onscrolltocite(ref.citeKey);
								authorPopover = null;
							}}
							class="flex w-full items-baseline gap-1.5 rounded px-2 py-1.5 text-left transition-colors hover:bg-paper-ui dark:hover:bg-dark-paper-ui"
						>
							<span class="shrink-0 font-mono text-[10px] text-accent">@{ref.citeKey}</span>
							<span
								class="min-w-0 truncate font-sans text-xs text-ink dark:text-dark-ink"
								title={ref.title}>{ref.title}</span
							>
							{#if ref.year}
								<span class="shrink-0 font-sans text-[10px] text-ink-faint dark:text-dark-ink-faint"
									>({ref.year})</span
								>
							{/if}
						</button>
					{/each}
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
{#if showNewComment && savedCommentSelection && savedCommentSelection.coords}
	<div
		class="pointer-events-none fixed z-20"
		style="top: {savedCommentSelection.coords.bottom + 8}px; left: {savedCommentSelection.coords
			.left}px;"
	>
		<div
			class="pointer-events-auto w-72 rounded-xl border border-paper-border bg-paper p-3 shadow-xl dark:border-dark-paper-border dark:bg-dark-paper"
		>
			<p
				class="mb-2 truncate border-l-2 border-amber-400 pl-2 font-sans text-xs text-ink-muted italic dark:text-dark-ink-muted"
			>
				«{savedCommentSelection.text.slice(0, 60)}{savedCommentSelection.text.length > 60
					? '…'
					: ''}»
			</p>
			<textarea
				use:focusOnMount
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
						savedCommentSelection = null;
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

<!-- Subnote popover (anchored near selection) -->
{#if showSubnote && savedCommentSelection?.coords}
	<div
		class="pointer-events-none fixed z-20"
		style="top: {savedCommentSelection.coords.bottom + 8}px; left: {savedCommentSelection.coords
			.left}px;"
	>
		<div
			class="pointer-events-auto w-80 rounded-xl border border-paper-border bg-paper p-3 shadow-xl dark:border-dark-paper-border dark:bg-dark-paper"
		>
			<p class="mb-2 font-sans text-xs font-semibold text-ink-muted dark:text-dark-ink-muted">
				Nueva subnota bibliográfica
			</p>
			<p
				class="mb-3 truncate border-l-2 border-paper-border pl-2 font-sans text-xs text-ink-muted italic dark:text-dark-ink-muted"
			>
				«{savedCommentSelection.text.slice(0, 80)}{savedCommentSelection.text.length > 80
					? '…'
					: ''}»
			</p>
			{#if !sourceReference}
				<label
					for="subnote-ref"
					class="mb-1 block font-sans text-xs text-ink-faint dark:text-dark-ink-faint"
					>Referencia</label
				>
				<select
					id="subnote-ref"
					bind:value={subnoteRefId}
					class="mb-2 w-full rounded-md border border-paper-border bg-paper-ui px-2 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
				>
					<option value="">— elige referencia —</option>
					{#each projectRefs as ref}
						<option value={ref.id ?? ''}>{ref.citeKey}</option>
					{/each}
				</select>
			{:else}
				<p class="mb-2 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
					Referencia: <span class="font-mono text-accent">@{sourceReference.citeKey}</span>
				</p>
			{/if}
			<label
				for="subnote-slug"
				class="mb-1 block font-sans text-xs text-ink-faint dark:text-dark-ink-faint"
				>Slug <span class="text-ink-faint">(identificador único)</span></label
			>
			<input
				id="subnote-slug"
				bind:value={subnoteSlug}
				type="text"
				placeholder="p247-exchange"
				class="mb-2 w-full rounded-md border border-paper-border bg-paper-ui px-2 py-1.5 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
			/>
			<label
				for="subnote-notes"
				class="mb-1 block font-sans text-xs text-ink-faint dark:text-dark-ink-faint">Nota</label
			>
			<textarea
				id="subnote-notes"
				use:focusOnMount
				bind:value={subnoteNotes}
				rows={3}
				class="w-full resize-none rounded-md border border-paper-border bg-paper-ui px-2 py-1.5 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
			></textarea>
			{#if subnoteError}
				<p class="mt-1 font-sans text-xs text-red-500">{subnoteError}</p>
			{/if}
			<div class="mt-2 flex gap-2">
				<button
					onclick={submitSubnote}
					disabled={submittingSubnote ||
						!subnoteSlug.trim() ||
						!subnoteNotes.trim() ||
						!subnoteRefId}
					class="flex-1 rounded-md bg-accent py-1.5 font-sans text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
				>
					{submittingSubnote ? 'Saving…' : 'Save annotation'}
				</button>
				<button
					onclick={() => {
						showSubnote = false;
						savedCommentSelection = null;
					}}
					class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-xs text-ink-muted hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted"
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
		style="top: {paragraphCommentPos.top}px; right: {window.innerWidth -
			paragraphCommentPos.right +
			8}px;"
	>
		<div
			bind:this={paragraphCommentEl}
			class="pointer-events-auto w-72 rounded-xl border border-paper-border bg-paper p-3 shadow-xl dark:border-dark-paper-border dark:bg-dark-paper"
		>
			<p class="mb-2 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
				Comentario en ¶{pendingParagraphNumber}
			</p>
			<textarea
				use:focusOnMount
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
					onclick={() => {
						showNewParagraphComment = false;
						paragraphCommentText = '';
					}}
					class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted"
				>
					Cancel
				</button>
			</div>
		</div>
	</div>
{/if}
