<script lang="ts">
	import { resolveRoute } from '$app/paths';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Blog — Scholio</title>
</svelte:head>

<main class="mx-auto max-w-2xl px-6 py-16">
	<h1 class="text-foreground mb-2 text-3xl font-bold tracking-tight">Blog</h1>
	<p class="text-muted-foreground mb-12 text-base">Novedades y anuncios del equipo de Scholio.</p>

	{#if data.posts.length === 0}
		<p class="text-muted-foreground">No hay entradas todavía.</p>
	{:else}
		<ul class="space-y-8">
			{#each data.posts as post (post.slug)}
				<li>
					<a href={resolveRoute('/blog/[slug]', { slug: post.slug })} class="group block">
						<time class="text-muted-foreground mb-1 block text-sm">
							{new Date(post.date).toLocaleDateString('es-ES', {
								year: 'numeric',
								month: 'long',
								day: 'numeric'
							})}
						</time>
						<h2
							class="text-foreground group-hover:text-primary mb-1 text-xl font-semibold transition-colors"
						>
							{post.title}
						</h2>
						<p class="text-muted-foreground text-sm leading-relaxed">{post.summary}</p>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</main>
