<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import CommentThread from './CommentThread.svelte';

	type Reply = { id: string; content: string; authorName: string; createdAt: Date };

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
		comments,
		activeCommentId = null,
		currentUserId,
		chapters = [],
		onlookup,
		oncommentclick,
		onresolved,
		onreopened,
		onreplyadded,
		ondeleted
	}: {
		comments: InlineComment[];
		activeCommentId?: string | null;
		currentUserId: string;
		chapters?: { id: string; title: string }[];
		onlookup?: (partial: string, context: string) => Promise<string[]>;
		oncommentclick?: (id: string) => void;
		onresolved?: (id: string) => void;
		onreopened?: (id: string) => void;
		onreplyadded?: (commentId: string, reply: Reply) => void;
		ondeleted?: (id: string) => void;
	} = $props();

	const openCount = $derived(comments.filter((c) => c.status === 'open').length);

	$effect(() => {
		const id = activeCommentId;
		if (!id) return;
		Promise.resolve().then(() => {
			document
				.querySelector(`[data-comment-id="${CSS.escape(id)}"]`)
				?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		});
	});
</script>

<div class="flex w-80 shrink-0 flex-col overflow-hidden border-l border-paper-border bg-paper">
	<div class="flex items-center justify-between border-b border-paper-border px-4 py-3">
		<h3 class="font-serif text-sm font-semibold text-ink">Comments</h3>
		<span class="font-sans text-xs text-ink-faint">
			{openCount} open
		</span>
	</div>

	<div class="flex-1 space-y-2 overflow-y-auto p-3">
		{#if comments.length === 0}
			<EmptyState
				compact
				icon={MessageSquare}
				title="No comments yet"
				description="Select text in the document to comment on it."
			/>
		{:else}
			{#each comments as c (c.id)}
				<div data-comment-id={c.id}>
					<CommentThread
						comment={{ ...c, resolved: c.status === 'resolved' }}
						{currentUserId}
						isActive={c.id === activeCommentId}
						onclick={oncommentclick}
						{onresolved}
						{onreopened}
						{onreplyadded}
						{ondeleted}
						{chapters}
						{onlookup}
					/>
				</div>
			{/each}
		{/if}
	</div>
</div>
