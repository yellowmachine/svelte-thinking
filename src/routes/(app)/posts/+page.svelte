<script lang="ts">
	import { trpc } from '$lib/utils/trpc';
	import { resolve } from '$app/paths';
	import { SvelteSet, SvelteMap } from 'svelte/reactivity';
	import SafeDeleteDialog from '$lib/components/ui/SafeDeleteDialog.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Post = (typeof data.posts)[number];

	let unpublishedIds = new SvelteSet<string>();
	let unpublishingId = $state<string | null>(null);
	let postToUnpublish = $state<Post | null>(null);

	let commentsEnabledOverrides = new SvelteMap<string, boolean>();
	let commentsVisibleOverrides = new SvelteMap<string, boolean>();

	const posts = $derived(
		data.posts
			.filter((p) => !unpublishedIds.has(p.id))
			.map((p) => ({
				...p,
				commentsEnabled: commentsEnabledOverrides.get(p.id) ?? p.commentsEnabled,
				commentsVisible: commentsVisibleOverrides.get(p.id) ?? p.commentsVisible
			}))
	);

	type ModerationComment = Awaited<
		ReturnType<typeof trpc.blogComments.listForModeration.query>
	>[number];

	let expandedPostId = $state<string | null>(null);
	let moderationComments = $state<ModerationComment[]>([]);
	let moderationLoading = $state(false);
	let togglingPostId = $state<string | null>(null);
	let commentActionId = $state<string | null>(null);

	async function toggleModeration(post: Post) {
		if (expandedPostId === post.id) {
			expandedPostId = null;
			return;
		}
		expandedPostId = post.id;
		moderationLoading = true;
		try {
			moderationComments = await trpc.blogComments.listForModeration.query(post.id);
		} finally {
			moderationLoading = false;
		}
	}

	async function setCommentsEnabled(post: Post, enabled: boolean) {
		togglingPostId = post.id;
		try {
			await trpc.blog.setCommentsEnabled.mutate({ postId: post.id, enabled });
			commentsEnabledOverrides.set(post.id, enabled);
		} finally {
			togglingPostId = null;
		}
	}

	async function setCommentsVisible(post: Post, visible: boolean) {
		togglingPostId = post.id;
		try {
			await trpc.blog.setCommentsVisible.mutate({ postId: post.id, visible });
			commentsVisibleOverrides.set(post.id, visible);
		} finally {
			togglingPostId = null;
		}
	}

	async function moderate(comment: ModerationComment, status: 'approved' | 'hidden') {
		commentActionId = comment.id;
		try {
			await trpc.blogComments.moderate.mutate({ commentId: comment.id, status });
			comment.status = status;
		} finally {
			commentActionId = null;
		}
	}

	async function deleteComment(comment: ModerationComment) {
		commentActionId = comment.id;
		try {
			await trpc.blogComments.delete.mutate(comment.id);
			moderationComments = moderationComments.filter((c) => c.id !== comment.id);
		} finally {
			commentActionId = null;
		}
	}

	const statusLabel: Record<string, string> = {
		pending: 'Pendiente',
		approved: 'Aprobado',
		hidden: 'Oculto'
	};

	const dateFmt = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' });
	const monthFmt = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' });

	function monthLabel(month: string): string {
		const [year, m] = month.split('-').map(Number);
		return monthFmt.format(new Date(Date.UTC(year, m - 1, 1)));
	}

	async function unpublish() {
		const post = postToUnpublish;
		if (!post) return;
		unpublishingId = post.id;
		try {
			await trpc.blog.unpublish.mutate({ postId: post.id });
			unpublishedIds.add(post.id);
		} finally {
			unpublishingId = null;
			postToUnpublish = null;
		}
	}
</script>

<div class="mx-auto max-w-5xl px-6 py-10">
	<div class="mb-8">
		<h1 class="font-serif text-3xl font-semibold text-ink dark:text-dark-ink">Blog</h1>
		<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Gestiona las publicaciones de tu blog.
		</p>
	</div>

	{#if !data.handle}
		<div
			class="rounded-xl border border-paper-border bg-paper p-6 text-center dark:border-dark-paper-border dark:bg-dark-paper"
		>
			<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				Todavía no has configurado tu blog.
			</p>
			<a
				href={resolve('/settings?tab=blog')}
				class="inline-block rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90"
			>
				Configurar mi blog →
			</a>
		</div>
	{:else if data.months.length === 0}
		<p class="font-sans text-sm text-ink-faint dark:text-dark-ink-faint">
			Todavía no has publicado nada. Publica una versión desde el historial de un documento.
		</p>
	{:else}
		<div class="flex flex-col gap-8 sm:flex-row">
			<div class="flex-1">
				{#if posts.length === 0}
					<p class="font-sans text-sm text-ink-faint dark:text-dark-ink-faint">
						No hay publicaciones en {monthLabel(data.selectedMonth)}.
					</p>
				{:else}
					<div class="flex flex-col gap-2">
						{#each posts as post (post.id)}
							{@const pendingCount =
								expandedPostId === post.id
									? moderationComments.filter((c) => c.status === 'pending').length
									: post.pendingCommentCount}
							<div
								class="rounded-lg border border-paper-border bg-paper dark:border-dark-paper-border dark:bg-dark-paper"
							>
								<div class="flex items-center justify-between gap-3 px-4 py-3">
									<div class="min-w-0 flex-1">
										<a
											href={resolve('/@[handle]/[slug]', { handle: data.handle, slug: post.slug })}
											target="_blank"
											rel="noopener noreferrer"
											class="truncate font-sans text-sm font-medium text-ink hover:underline dark:text-dark-ink"
										>
											{post.title}
										</a>
										<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
											{dateFmt.format(new Date(post.publishedAt))} · originado en
											<a
												href={resolve(
													`/projects/${post.projectId}/documents/${post.documentId}/history`
												)}
												class="underline decoration-dotted hover:text-ink-muted dark:hover:text-dark-ink-muted"
											>
												v{post.versionNumber}
											</a>
										</p>
									</div>
									<button
										type="button"
										onclick={() => toggleModeration(post)}
										class="shrink-0 font-sans text-xs text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
									>
										Comentarios{pendingCount > 0
											? ` (${pendingCount} pendiente${pendingCount === 1 ? '' : 's'})`
											: ''}
									</button>
									<button
										type="button"
										onclick={() => (postToUnpublish = post)}
										disabled={unpublishingId === post.id}
										class="shrink-0 font-sans text-xs text-red-500 transition-colors hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
									>
										{unpublishingId === post.id ? 'Despublicando...' : 'Despublicar'}
									</button>
								</div>

								{#if expandedPostId === post.id}
									<div class="border-t border-paper-border px-4 py-3 dark:border-dark-paper-border">
										<div class="flex flex-wrap items-center gap-4">
											<label
												class="flex items-center gap-2 font-sans text-xs text-ink-muted dark:text-dark-ink-muted"
											>
												<input
													type="checkbox"
													checked={post.commentsEnabled}
													disabled={togglingPostId === post.id}
													onchange={(e) => setCommentsEnabled(post, e.currentTarget.checked)}
													class="rounded"
												/>
												Permitir comentarios nuevos
											</label>
											<label
												class="flex items-center gap-2 font-sans text-xs text-ink-muted dark:text-dark-ink-muted"
											>
												<input
													type="checkbox"
													checked={post.commentsVisible}
													disabled={togglingPostId === post.id}
													onchange={(e) => setCommentsVisible(post, e.currentTarget.checked)}
													class="rounded"
												/>
												Mostrar comentarios publicados
											</label>
										</div>

										{#if moderationLoading}
											<p class="mt-3 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
												Cargando comentarios...
											</p>
										{:else if moderationComments.length === 0}
											<p class="mt-3 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
												Todavía no hay comentarios en esta publicación.
											</p>
										{:else}
											<ul class="mt-3 flex flex-col gap-3">
												{#each moderationComments as comment (comment.id)}
													<li
														class="rounded-md border border-paper-border p-3 dark:border-dark-paper-border"
													>
														<div class="flex flex-wrap items-center gap-2">
															<span
																class="font-sans text-xs font-medium text-ink dark:text-dark-ink"
															>
																{statusLabel[comment.status]}
															</span>
															{#if comment.aiFlagged}
																<span
																	class="rounded bg-amber-100 px-1.5 py-0.5 font-sans text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
																	title={comment.aiReason ?? ''}
																>
																	Marcado por IA
																</span>
															{/if}
															<span
																class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint"
															>
																{dateFmt.format(new Date(comment.createdAt))}
															</span>
														</div>
														<p
															class="mt-1 font-sans text-sm whitespace-pre-wrap text-ink-muted dark:text-dark-ink-muted"
														>
															{comment.content}
														</p>
														<div class="mt-2 flex gap-3">
															{#if comment.status !== 'approved'}
																<button
																	type="button"
																	disabled={commentActionId === comment.id}
																	onclick={() => moderate(comment, 'approved')}
																	class="font-sans text-xs text-emerald-600 hover:text-emerald-700 disabled:opacity-50 dark:text-emerald-400 dark:hover:text-emerald-300"
																>
																	Aprobar
																</button>
															{/if}
															{#if comment.status !== 'hidden'}
																<button
																	type="button"
																	disabled={commentActionId === comment.id}
																	onclick={() => moderate(comment, 'hidden')}
																	class="font-sans text-xs text-ink-muted hover:text-ink disabled:opacity-50 dark:text-dark-ink-muted dark:hover:text-dark-ink"
																>
																	Ocultar
																</button>
															{/if}
															<button
																type="button"
																disabled={commentActionId === comment.id}
																onclick={() => deleteComment(comment)}
																class="font-sans text-xs text-red-500 hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
															>
																Eliminar
															</button>
														</div>
													</li>
												{/each}
											</ul>
										{/if}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<nav class="shrink-0 sm:w-48">
				<p
					class="mb-2 font-sans text-xs font-semibold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint"
				>
					Archivo
				</p>
				<ul class="flex flex-col gap-0.5">
					{#each data.months as bucket (bucket.month)}
						<li>
							<a
								href={resolve(`/posts?month=${bucket.month}`)}
								class="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 font-sans text-sm transition-colors {bucket.month ===
								data.selectedMonth
									? 'bg-accent/10 text-accent'
									: 'text-ink-muted hover:bg-paper-ui hover:text-ink dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui dark:hover:text-dark-ink'}"
							>
								<span class="capitalize">{monthLabel(bucket.month)}</span>
								<span class="text-xs text-ink-faint dark:text-dark-ink-faint">{bucket.count}</span>
							</a>
						</li>
					{/each}
				</ul>
			</nav>
		</div>
	{/if}
</div>

<SafeDeleteDialog
	open={!!postToUnpublish}
	title="Despublicar publicación"
	label={postToUnpublish?.title ?? ''}
	confirmLabel="Despublicar"
	warning="La URL pública dejará de funcionar. Puedes volver a publicarla cuando quieras."
	deleting={unpublishingId === postToUnpublish?.id}
	requireCode={false}
	onconfirm={unpublish}
	oncancel={() => (postToUnpublish = null)}
/>
