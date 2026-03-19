<script lang="ts">
	import { trpc } from '$lib/utils/trpc';

	type Reply = {
		id: string;
		content: string;
		authorName: string;
		createdAt: Date;
	};

	type Comment = {
		id: string;
		content: string;
		authorName: string;
		anchorText: string | null;
		resolved: boolean;
		createdAt: Date;
		replies: Reply[];
	};

	let {
		comment,
		currentUserId,
		onresolved,
		onreopened,
		onreplyadded,
		onclick
	}: {
		comment: Comment;
		currentUserId: string;
		onresolved?: (id: string) => void;
		onreopened?: (id: string) => void;
		onreplyadded?: (commentId: string, reply: Reply) => void;
		onclick?: (id: string) => void;
	} = $props();

	let replyText = $state('');
	let submittingReply = $state(false);
	let resolving = $state(false);

	async function submitReply() {
		if (!replyText.trim()) return;
		submittingReply = true;
		try {
			const reply = await trpc.comments.addReply.mutate({
				commentId: comment.id,
				content: replyText.trim()
			});
			onreplyadded?.(comment.id, reply);
			replyText = '';
		} finally {
			submittingReply = false;
		}
	}

	async function toggleResolve() {
		resolving = true;
		try {
			if (comment.resolved) {
				await trpc.comments.reopen.mutate(comment.id);
				onreopened?.(comment.id);
			} else {
				await trpc.comments.resolve.mutate(comment.id);
				onresolved?.(comment.id);
			}
		} finally {
			resolving = false;
		}
	}

	function formatDate(d: Date) {
		return new Intl.DateTimeFormat('es', {
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		}).format(new Date(d));
	}
</script>

<div
	class="group cursor-pointer rounded-lg border border-paper-border bg-paper p-3 transition-colors hover:border-accent/40 dark:border-dark-paper-border dark:bg-dark-paper {comment.resolved
		? 'opacity-60'
		: ''}"
	role="button"
	tabindex="0"
	onclick={() => onclick?.(comment.id)}
	onkeydown={(e) => e.key === 'Enter' && onclick?.(comment.id)}
>
	<!-- Anchor text excerpt -->
	{#if comment.anchorText}
		<p
			class="mb-2 truncate border-l-2 border-amber-400 pl-2 font-sans text-xs italic text-ink-muted dark:text-dark-ink-muted"
		>
			{comment.anchorText.slice(0, 80)}{comment.anchorText.length > 80 ? '…' : ''}
		</p>
	{/if}

	<!-- Main comment body -->
	<div class="flex items-start justify-between gap-2">
		<div class="min-w-0">
			<p class="font-sans text-xs font-semibold text-ink dark:text-dark-ink">{comment.authorName}</p>
			<p class="mt-0.5 font-sans text-sm text-ink dark:text-dark-ink">{comment.content}</p>
			<p class="mt-1 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
				{formatDate(comment.createdAt)}
			</p>
		</div>

		<button
			onclick={(e) => {
				e.stopPropagation();
				toggleResolve();
			}}
			disabled={resolving}
			class="shrink-0 rounded px-2 py-1 font-sans text-xs transition-colors {comment.resolved
				? 'text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui'
				: 'text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20'} disabled:opacity-50"
			title={comment.resolved ? 'Reabrir' : 'Resolver'}
		>
			{comment.resolved ? 'Reabrir' : 'Resolver'}
		</button>
	</div>

	<!-- Replies -->
	{#if comment.replies.length > 0}
		<div class="mt-3 space-y-2 border-t border-paper-border pt-2 dark:border-dark-paper-border">
			{#each comment.replies as reply (reply.id)}
				<div>
					<p class="font-sans text-xs font-semibold text-ink dark:text-dark-ink">
						{reply.authorName}
					</p>
					<p class="mt-0.5 font-sans text-sm text-ink dark:text-dark-ink">{reply.content}</p>
					<p class="mt-0.5 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
						{formatDate(reply.createdAt)}
					</p>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Reply input -->
	{#if !comment.resolved}
		<div class="mt-3" onclick={(e) => e.stopPropagation()} role="presentation">
			<div class="flex gap-2">
				<input
					bind:value={replyText}
					onkeydown={(e) => e.key === 'Enter' && !e.shiftKey && submitReply()}
					placeholder="Responder…"
					class="min-w-0 flex-1 rounded border border-paper-border bg-paper-ui px-2 py-1 font-sans text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
				/>
				<button
					onclick={submitReply}
					disabled={submittingReply || !replyText.trim()}
					class="shrink-0 rounded bg-accent px-2 py-1 font-sans text-xs text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
				>
					{submittingReply ? '…' : 'OK'}
				</button>
			</div>
		</div>
	{/if}
</div>
