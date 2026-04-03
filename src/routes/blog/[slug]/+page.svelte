<script lang="ts">
	import { resolveRoute as resolve } from '$app/paths';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{data.meta.title} — Scholio Blog</title>
	<meta name="description" content={data.meta.summary} />
</svelte:head>

<main class="mx-auto max-w-2xl px-6 py-16">
	<a href={resolve('/blog', {})} class="text-muted-foreground hover:text-foreground mb-8 inline-flex items-center gap-1 text-sm transition-colors">
		← Blog
	</a>

	<article class="prose prose-neutral dark:prose-invert mt-4 max-w-none">
		<header class="not-prose mb-8">
			<time class="text-muted-foreground mb-3 block text-sm">
				{new Date(data.meta.date).toLocaleDateString('es-ES', {
					year: 'numeric',
					month: 'long',
					day: 'numeric'
				})}
			</time>
			<h1 class="text-foreground text-3xl font-bold tracking-tight">{data.meta.title}</h1>
			<p class="text-muted-foreground mt-2 text-base">{data.meta.summary}</p>
		</header>

		<svelte:component this={data.content} />
	</article>
</main>
