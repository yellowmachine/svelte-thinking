<script lang="ts">
	import { goto } from '$app/navigation';
	import { trpc } from '$lib/utils/trpc';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	async function resolveThread(commentId: string) {
		await trpc.comments.resolve.mutate(commentId);
		// Refresh
		goto('', { invalidateAll: true });
	}

	function formatDate(d: Date) {
		return new Intl.DateTimeFormat('en', {
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		}).format(new Date(d));
	}
</script>

<div class="mx-auto max-w-3xl px-6 py-8">
	<!-- Header -->
	<div class="mb-8">
		<a
			href="/projects/{data.project.id}"
			class="mb-3 flex items-center gap-1.5 font-sans text-sm text-ink-muted hover:text-accent dark:text-dark-ink-muted"
		>
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M15 18l-6-6 6-6" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
			{data.project.title}
		</a>
		<h1 class="font-serif text-3xl font-semibold text-ink dark:text-dark-ink">Open comments</h1>
		{#if data.documents.length === 0}
			<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				No open comment threads.
			</p>
		{:else}
			<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				{data.documents.reduce((n, d) => n + d.threads.length, 0)} open
				{data.documents.reduce((n, d) => n + d.threads.length, 0) === 1 ? 'thread' : 'threads'}
				across {data.documents.length}
				{data.documents.length === 1 ? 'document' : 'documents'}
			</p>
		{/if}
	</div>

	{#if data.documents.length === 0}
		<div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-paper-border py-20 dark:border-dark-paper-border">
			<svg width="32" height="32" viewBox="0 0 24 24" fill="none" class="mb-3 text-ink-faint dark:text-dark-ink-faint">
				<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
			<p class="font-serif text-base font-medium text-ink dark:text-dark-ink">All clear</p>
			<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				No open comment threads in this project.
			</p>
		</div>
	{:else}
		<div class="flex flex-col gap-8">
			{#each data.documents as doc (doc.documentId)}
				<section>
					<!-- Document heading -->
					<div class="mb-3 flex items-center gap-2">
						<a
							href="/projects/{data.project.id}/documents/{doc.documentId}"
							class="font-serif text-lg font-semibold text-ink hover:text-accent dark:text-dark-ink"
						>
							{doc.documentTitle}
						</a>
						<span class="rounded-full bg-amber-100 px-2 py-0.5 font-sans text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
							{doc.threads.length}
						</span>
					</div>

					<div class="flex flex-col gap-3">
						{#each doc.threads as thread (thread.id)}
							<div class="rounded-xl border border-paper-border bg-paper p-4 dark:border-dark-paper-border dark:bg-dark-paper">
								<!-- Thread anchor / label -->
								{#if thread.anchorText}
									<p class="mb-2 line-clamp-2 rounded-md bg-amber-50 px-2.5 py-1.5 font-sans text-xs italic text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
										"{thread.anchorText}"
									</p>
								{:else if thread.paragraphNumber}
									<p class="mb-2 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
										¶{thread.paragraphNumber}
									</p>
								{/if}

								<!-- Top-level comment -->
								<div class="flex items-start justify-between gap-3">
									<div class="min-w-0 flex-1">
										<div class="mb-0.5 flex items-center gap-2">
											<span class="font-sans text-xs font-medium text-ink dark:text-dark-ink">
												{thread.authorName ?? 'Unknown'}
											</span>
											<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
												{formatDate(thread.createdAt)}
											</span>
										</div>
										<p class="font-sans text-sm leading-relaxed text-ink dark:text-dark-ink">
											{thread.content}
										</p>
									</div>

									{#if data.project.ownerId === data.currentUserId || thread.authorId === data.currentUserId}
										<button
											type="button"
											onclick={() => resolveThread(thread.id)}
											class="shrink-0 rounded-md border border-paper-border px-2.5 py-1 font-sans text-xs text-ink-muted transition-colors hover:border-green-300 hover:bg-green-50 hover:text-green-700 dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-green-900/20 dark:hover:text-green-400"
											title="Mark as resolved"
										>
											Resolve
										</button>
									{/if}
								</div>

								<!-- Replies -->
								{#if thread.replies.length > 0}
									<div class="mt-3 flex flex-col gap-2 border-l-2 border-paper-border pl-3 dark:border-dark-paper-border">
										{#each thread.replies as reply (reply.id)}
											<div>
												<div class="mb-0.5 flex items-center gap-2">
													<span class="font-sans text-xs font-medium text-ink dark:text-dark-ink">
														{reply.authorName ?? 'Unknown'}
													</span>
													<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
														{formatDate(reply.createdAt)}
													</span>
												</div>
												<p class="font-sans text-sm leading-relaxed text-ink dark:text-dark-ink">
													{reply.content}
												</p>
											</div>
										{/each}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</section>
			{/each}
		</div>
	{/if}
</div>
