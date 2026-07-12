<script lang="ts">
	import type { PageData } from './$types';
	import favicon from '$lib/assets/favicon.svg';

	import { resolve } from '$app/paths';
	let { data }: { data: PageData } = $props();

	const fmt = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' });

	const title = $derived(`${data.author.displayName ?? '@' + data.author.handle} — Blog`);
	const description = $derived(
		data.author.bio?.slice(0, 160) ?? `Artículos de @${data.author.handle} en Scholio.`
	);
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<link
		rel="alternate"
		type="application/rss+xml"
		{title}
		href={`/@${data.author.handle}/rss.xml`}
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
		<h1 class="font-serif text-3xl font-semibold text-ink dark:text-dark-ink">
			{data.author.displayName ?? `@${data.author.handle}`}
		</h1>
		<p class="mt-1 font-sans text-sm text-ink-faint dark:text-dark-ink-faint">
			@{data.author.handle}
		</p>
		{#if data.author.bio}
			<p class="mt-3 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				{data.author.bio}
			</p>
		{/if}
	</div>

	{#if data.posts.length === 0}
		<p class="font-sans text-sm text-ink-faint dark:text-dark-ink-faint">
			Todavía no hay publicaciones.
		</p>
	{:else}
		<ul class="flex flex-col gap-6">
			{#each data.posts as post (post.slug)}
				<li>
					<a
						href={resolve('/@[handle]/[slug]', {
							handle: data.author.handle ?? '',
							slug: post.slug
						})}
						class="block rounded-lg border border-paper-border p-5 transition-colors hover:border-accent dark:border-dark-paper-border"
					>
						<h2 class="font-serif text-xl font-semibold text-ink dark:text-dark-ink">
							{post.title}
						</h2>
						<p class="mt-1 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
							{fmt.format(new Date(post.publishedAt))}
						</p>
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
