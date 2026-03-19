<script lang="ts">
	type CommentType = 'general' | 'inline';
	type CommentStatus = 'open' | 'resolved';

	let {
		authorName,
		content,
		createdAt,
		type = 'general',
		status = 'open',
		replyCount = 0,
		anchorText,
		onresolve,
		onreply
	}: {
		authorName: string;
		content: string;
		createdAt: Date;
		type?: CommentType;
		status?: CommentStatus;
		replyCount?: number;
		anchorText?: string;
		onresolve?: () => void;
		onreply?: () => void;
	} = $props();

	let formattedDate = $derived(
		new Intl.DateTimeFormat('es', {
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		}).format(createdAt)
	);

	let initials = $derived(
		authorName
			.split(' ')
			.map((n) => n[0])
			.slice(0, 2)
			.join('')
			.toUpperCase()
	);
</script>

<div
	class="rounded-lg border bg-paper p-4 font-sans dark:bg-dark-paper
		{status === 'resolved'
		? 'border-paper-border opacity-60 dark:border-dark-paper-border'
		: 'border-paper-border dark:border-dark-paper-border'}"
>
	{#if type === 'inline' && anchorText}
		<div
			class="mb-3 rounded border-l-2 border-accent bg-accent-light/50 px-3 py-1.5 font-serif text-sm italic text-ink-muted dark:text-dark-ink-muted"
		>
			"{anchorText}"
		</div>
	{/if}

	<div class="flex items-start gap-3">
		<div
			class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent font-sans text-xs font-semibold text-white"
		>
			{initials}
		</div>

		<div class="min-w-0 flex-1">
			<div class="flex items-center gap-2">
				<span class="text-sm font-medium text-ink dark:text-dark-ink">{authorName}</span>
				<span class="text-xs text-ink-faint dark:text-dark-ink-faint">{formattedDate}</span>
				{#if status === 'resolved'}
					<span class="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">Resuelto</span>
				{/if}
			</div>

			<p class="mt-1.5 text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
				{content}
			</p>

			<div class="mt-3 flex items-center gap-3">
				{#if replyCount > 0}
					<button
						onclick={onreply}
						class="text-xs text-ink-faint transition-colors hover:text-ink dark:text-dark-ink-faint dark:hover:text-dark-ink"
					>
						{replyCount}
						{replyCount === 1 ? 'respuesta' : 'respuestas'}
					</button>
				{:else}
					<button
						onclick={onreply}
						class="text-xs text-ink-faint transition-colors hover:text-ink dark:text-dark-ink-faint dark:hover:text-dark-ink"
					>
						Responder
					</button>
				{/if}

				{#if status === 'open'}
					<button
						onclick={onresolve}
						class="text-xs text-ink-faint transition-colors hover:text-green-600 dark:text-dark-ink-faint"
					>
						Resolver
					</button>
				{/if}
			</div>
		</div>
	</div>
</div>
