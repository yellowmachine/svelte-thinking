<script lang="ts">
	import type { PageData } from './$types';
	import favicon from '$lib/assets/favicon.svg';
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';

	let { data }: { data: PageData } = $props();

	const fmt = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' });
	const canonicalUrl = $derived($page.url.origin + $page.url.pathname);
</script>

<svelte:head>
	<title>{data.aggregator.title} — @{data.curator.handle}</title>
	<meta name="description" content={data.description} />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={data.aggregator.title} />
	<meta property="og:description" content={data.description} />
	<meta property="og:url" content={canonicalUrl} />
	<link rel="canonical" href={canonicalUrl} />
	<link
		rel="alternate"
		type="application/rss+xml"
		title={data.aggregator.title}
		href={resolve('/@[handle]/list/[slug]/rss.xml', {
			handle: data.curator.handle ?? '',
			slug: data.aggregator.slug
		})}
	/>
	<link rel="icon" href={favicon} />
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
	<div class="mb-10 border-b border-paper-border pb-6 dark:border-dark-paper-border">
		<a
			href={resolve('/@[handle]', { handle: data.curator.handle ?? '' })}
			class="font-sans text-sm text-ink-muted underline decoration-dotted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
		>
			Lista de @{data.curator.handle}
		</a>
		<h1 class="mt-2 font-serif text-3xl font-semibold text-ink dark:text-dark-ink">
			{data.aggregator.title}
		</h1>
		{#if data.aggregator.description}
			<p class="mt-3 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				{data.aggregator.description}
			</p>
		{/if}

		<a
			href={resolve('/@[handle]/list/[slug]/rss.xml', {
				handle: data.curator.handle ?? '',
				slug: data.aggregator.slug
			})}
			title="Feed RSS"
			class="mt-3 flex w-fit items-center gap-1 font-sans text-xs text-ink-faint transition-colors hover:text-ink dark:text-dark-ink-faint dark:hover:text-dark-ink"
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
				<path d="M4 11a9 9 0 0 1 9 9" />
				<path d="M4 4a16 16 0 0 1 16 16" />
				<circle cx="5" cy="19" r="1" />
			</svg>
			RSS
		</a>

		{#if data.items.length > 0}
			<div class="mt-4 flex flex-wrap gap-2">
				{#each data.items as item (item.handle)}
					<a
						href={resolve('/@[handle]', { handle: item.handle ?? '' })}
						class="rounded-full border border-paper-border px-3 py-1 font-sans text-xs text-ink-muted transition-colors hover:border-accent hover:text-ink dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:text-dark-ink"
					>
						{item.displayName ?? `@${item.handle}`}
					</a>
				{/each}
			</div>
		{/if}
	</div>

	{#if data.posts.length === 0}
		<p class="font-sans text-sm text-ink-faint dark:text-dark-ink-faint">
			Todavía no hay publicaciones en los blogs de esta lista.
		</p>
	{:else}
		<ul class="flex flex-col gap-6">
			{#each data.posts as post (post.authorHandle + '/' + post.slug)}
				<li>
					<a
						href={resolve('/@[handle]/[slug]', {
							handle: post.authorHandle ?? '',
							slug: post.slug
						})}
						class="block rounded-lg border border-paper-border p-5 transition-colors hover:border-accent dark:border-dark-paper-border"
					>
						<h2 class="font-serif text-xl font-semibold text-ink dark:text-dark-ink">
							{post.title}
						</h2>
						<p class="mt-1 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
							{post.authorDisplayName ?? `@${post.authorHandle}`} · {fmt.format(
								new Date(post.publishedAt)
							)}
						</p>
						{#if post.excerpt}
							<p class="mt-2 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
								{post.excerpt}{post.truncated ? '…' : ''}
							</p>
						{/if}
					</a>
				</li>
			{/each}
		</ul>
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
