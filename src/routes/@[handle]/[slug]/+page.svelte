<script lang="ts">
	import type { PageData } from './$types';
	import '$lib/styles/prose-content.css';

	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { trpc } from '$lib/utils/trpc';
	let { data }: { data: PageData } = $props();

	// Approved comments come from the server load; a freshly-posted comment is
	// always 'pending' so it never appears there — shown separately until the
	// next navigation/reload refreshes the approved list.
	let optimisticComments = $state<(typeof data.comments)[number][]>([]);
	const comments = $derived([...optimisticComments, ...data.comments]);
	let commentInput = $state('');
	let posting = $state(false);
	let postError = $state('');

	const fmt = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' });
	const commentFmt = new Intl.DateTimeFormat('es', {
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	});

	async function submitComment() {
		if (!commentInput.trim()) return;
		posting = true;
		postError = '';
		try {
			const created = await trpc.blogComments.create.mutate({
				blogPostId: data.post.id,
				content: commentInput.trim()
			});
			optimisticComments = [
				{
					id: created.id,
					authorId: created.authorId,
					authorName: 'Tú',
					content: created.content,
					createdAt: created.createdAt
				},
				...optimisticComments
			];
			commentInput = '';
		} catch (e) {
			postError = e instanceof Error ? e.message : 'Error al publicar el comentario.';
		} finally {
			posting = false;
		}
	}
	const canonicalUrl = $derived($page.url.origin + $page.url.pathname);
	const pdfUrl = $derived(
		resolve('/@[handle]/[slug]/pdf', { handle: data.author.handle ?? '', slug: data.post.slug })
	);
	const twitterUrl = $derived(
		`https://twitter.com/intent/tweet?url=${encodeURIComponent(canonicalUrl)}&text=${encodeURIComponent(data.post.title)}`
	);
</script>

<svelte:head>
	<title>{data.post.title} — {data.author.displayName ?? '@' + data.author.handle}</title>
	<meta name="description" content={data.description} />
	<meta property="og:type" content="article" />
	<meta property="og:title" content={data.post.title} />
	<meta property="og:description" content={data.description} />
	<meta property="og:url" content={canonicalUrl} />
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content={data.post.title} />
	<meta name="twitter:description" content={data.description} />
	<link rel="canonical" href={canonicalUrl} />
	<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.39/dist/katex.min.css" />
</svelte:head>

<header
	class="sticky top-0 z-20 border-b border-paper-border bg-paper/95 backdrop-blur-sm dark:border-dark-paper-border dark:bg-dark-paper/95"
>
	<div class="mx-auto flex max-w-2xl items-center justify-between gap-4 px-6 py-3">
		<a href={resolve('/')} class="flex items-center gap-2 transition-opacity hover:opacity-80">
			<div class="flex h-7 w-7 items-center justify-center rounded bg-accent">
				<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
					<path d="M2 3h10M2 7h7M2 11h5" stroke="white" stroke-width="1.5" stroke-linecap="round" />
				</svg>
			</div>
			<span class="font-serif text-base font-semibold text-ink dark:text-dark-ink">Scholio</span>
		</a>
		<div class="flex items-center gap-2">
			<a
				href={resolve('/blogs')}
				class="rounded-md px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui hover:text-ink dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui dark:hover:text-dark-ink"
			>
				Blogs
			</a>
			<a
				href={resolve('/login')}
				class="rounded-md px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui hover:text-ink dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui dark:hover:text-dark-ink"
			>
				Sign in
			</a>
		</div>
	</div>
</header>

<main class="mx-auto max-w-2xl px-6 py-12">
	<div class="mb-8 border-b border-paper-border pb-6 dark:border-dark-paper-border">
		<a
			href={resolve('/@[handle]', { handle: data.author.handle ?? '' })}
			class="font-sans text-sm text-ink-muted underline decoration-dotted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
		>
			@{data.author.handle}
		</a>
		<h1 class="mt-2 font-serif text-3xl font-semibold text-ink dark:text-dark-ink">
			{data.post.title}
		</h1>
		<div class="mt-3 flex flex-wrap items-center gap-4">
			<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
				{fmt.format(new Date(data.post.publishedAt))}
			</p>
			<div class="flex items-center gap-3">
				<!-- pdfUrl already goes through resolve() (see script block); twitterUrl
				     is genuinely external — the lint rule can't be satisfied for it -->
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a
					href={pdfUrl}
					title="Descargar PDF"
					aria-label="Descargar PDF"
					class="flex items-center gap-1 font-sans text-xs text-ink-faint transition-colors hover:text-ink dark:text-dark-ink-faint dark:hover:text-dark-ink"
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
						<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
						<polyline points="7 10 12 15 17 10" />
						<line x1="12" y1="15" x2="12" y2="3" />
					</svg>
					PDF
				</a>
				<a
					href={twitterUrl}
					target="_blank"
					rel="noopener noreferrer"
					title="Compartir en X"
					aria-label="Compartir en X"
					class="flex items-center gap-1 font-sans text-xs text-ink-faint transition-colors hover:text-ink dark:text-dark-ink-faint dark:hover:text-dark-ink"
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
						<path
							d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
						/>
					</svg>
					X
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			</div>
		</div>
	</div>

	<article class="prose-serif prose max-w-none dark:prose-invert">
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html data.post.renderedHtml}
	</article>

	{#if data.post.commentsEnabled || comments.length > 0}
		<section class="mt-16 border-t border-paper-border pt-8 dark:border-dark-paper-border">
			<h2 class="font-serif text-lg font-semibold text-ink dark:text-dark-ink">
				Comentarios{comments.length > 0 ? ` (${comments.length})` : ''}
			</h2>

			{#if data.post.commentsEnabled}
				{#if data.currentUserId}
					<div class="mt-4 flex flex-col gap-2">
						<textarea
							bind:value={commentInput}
							rows="3"
							maxlength="5000"
							placeholder="Escribe un comentario..."
							class="w-full rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
						></textarea>
						{#if postError}
							<p class="font-sans text-sm text-red-600 dark:text-red-400">{postError}</p>
						{/if}
						<button
							onclick={submitComment}
							disabled={posting || !commentInput.trim()}
							class="self-start rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
						>
							{posting ? 'Enviando...' : 'Comentar'}
						</button>
					</div>
				{:else}
					<p class="mt-3 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
						<a href={resolve('/login')} class="underline hover:text-ink dark:hover:text-dark-ink"
							>Inicia sesión</a
						> para comentar.
					</p>
				{/if}
			{/if}

			{#if comments.length > 0}
				<ul class="mt-6 flex flex-col gap-4">
					{#each comments as comment (comment.id)}
						<li class="border-b border-paper-border pb-4 dark:border-dark-paper-border">
							<div class="flex items-baseline gap-2">
								<span class="font-sans text-sm font-medium text-ink dark:text-dark-ink"
									>{comment.authorName}</span
								>
								<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
									{commentFmt.format(new Date(comment.createdAt))}
								</span>
								{#if optimisticComments.some((c) => c.id === comment.id)}
									<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint"
										>· pendiente de moderación</span
									>
								{/if}
							</div>
							<p
								class="mt-1 font-sans text-sm whitespace-pre-wrap text-ink-muted dark:text-dark-ink-muted"
							>
								{comment.content}
							</p>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</main>

<footer
	class="mt-16 border-t border-paper-border bg-paper-ui/50 py-12 dark:border-dark-paper-border dark:bg-dark-paper-ui/50"
>
	<div class="mx-auto max-w-2xl px-6 text-center">
		<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Publicado con <a href={resolve('/')} class="underline hover:text-ink dark:hover:text-dark-ink"
				>Scholio</a
			>.
		</p>
	</div>
</footer>
