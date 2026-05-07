<script lang="ts">
	import MarkdownPreview from '$lib/components/editor/MarkdownPreview.svelte';
	import type { PageData } from './$types';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	import { resolve } from '$app/paths';
	let { data }: { data: PageData } = $props();

	let activeChapterId = $state<string | null>(null);
	let isExporting = $state(false);

	function exportPdf() {
		isExporting = true;
		window.location.href = `/api/projects/${data.book.projectId}/documents/${data.book.id}/book-export`;
		// Reset flag after a delay (user may stay on page if export fails)
		setTimeout(() => {
			isExporting = false;
		}, 3000);
	}

	const docMap = $derived(() => {
		const map = new Map<string, { id: string; projectId: string }>();
		for (const d of data.projectDocs) {
			map.set(d.title, { id: d.id, projectId: d.projectId });
			map.set(d.id, { id: d.id, projectId: d.projectId });
		}
		return map;
	});

	function scrollToChapter(id: string) {
		const el = document.getElementById(`chapter-${id}`);
		if (el) {
			el.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	}

	// Track which chapter is in view using IntersectionObserver
	$effect(() => {
		const observers: IntersectionObserver[] = [];

		for (const chapter of data.chapters) {
			const el = document.getElementById(`chapter-${chapter.id}`);
			if (!el) continue;

			const obs = new IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						if (entry.isIntersecting) {
							activeChapterId = chapter.id;
						}
					}
				},
				{ rootMargin: '-20% 0px -70% 0px' }
			);
			obs.observe(el);
			observers.push(obs);
		}

		return () => {
			for (const obs of observers) obs.disconnect();
		};
	});
</script>

<svelte:head>
	<title>{data.book.title} — Scholio</title>
</svelte:head>

<div class="flex h-screen flex-col bg-paper dark:bg-dark-paper">
	<!-- Header -->
	<header
		class="sticky top-0 z-10 flex shrink-0 items-center gap-3 border-b border-paper-border bg-paper/95 px-6 py-3 backdrop-blur-sm dark:border-dark-paper-border dark:bg-dark-paper/95"
	>
		<a
			href={resolve(`/projects/${data.book.projectId}/documents/${data.book.id}`)}
			class="flex items-center gap-1.5 font-sans text-sm text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M15 18l-6-6 6-6" />
			</svg>
			Edit
		</a>
		<span class="text-ink-faint dark:text-dark-ink-faint">/</span>
		<span translate="no" class="font-serif font-semibold text-ink dark:text-dark-ink"
			>{data.book.title}</span
		>
		{#if data.chapters.length > 0}
			<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
				{data.chapters.length} chapter{data.chapters.length === 1 ? '' : 's'}
			</span>
		{/if}

		<!-- Export button (right side) -->
		<button
			onclick={exportPdf}
			disabled={isExporting}
			class="ml-auto flex items-center gap-1.5 font-sans text-sm text-ink-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-60 dark:text-dark-ink-muted dark:hover:text-dark-ink"
			title="Export to PDF"
		>
			{#if isExporting}
				<Spinner />
			{:else}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
					<polyline points="7 10 12 15 17 10" />
					<line x1="12" y1="15" x2="12" y2="3" />
				</svg>
			{/if}
			{#if !isExporting}Export{/if}
		</button>
	</header>

	<div class="flex flex-1 overflow-hidden">
		<!-- TOC sidebar (desktop only) -->
		{#if data.chapters.length > 0}
			<aside
				class="hidden w-56 shrink-0 overflow-y-auto border-r border-paper-border px-4 py-6 lg:block dark:border-dark-paper-border"
			>
				<p
					class="mb-3 font-sans text-xs font-semibold tracking-wider text-ink-faint uppercase dark:text-dark-ink-faint"
				>
					Contents
				</p>
				<nav class="flex flex-col gap-0.5">
					{#each data.chapters as chapter, i (chapter.id)}
						<button
							onclick={() => scrollToChapter(chapter.id)}
							class="rounded px-2 py-1.5 text-left font-sans text-sm transition-colors
								{activeChapterId === chapter.id
								? 'bg-accent-light font-medium text-accent dark:bg-accent/20 dark:text-dark-ink'
								: 'text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink'}"
						>
							<span class="mr-1.5 text-xs text-ink-faint dark:text-dark-ink-faint">{i + 1}.</span>
							<span translate="no">{chapter.title}</span>
						</button>
					{/each}
				</nav>
			</aside>
		{/if}

		<!-- Main reading area -->
		<main class="flex-1 overflow-y-auto">
			<div class="mx-auto max-w-2xl px-6 py-10">
				<!-- Book title -->
				<h1 translate="no" class="mb-8 font-serif text-3xl font-bold text-ink dark:text-dark-ink">
					{data.book.title}
				</h1>

				<!-- Preamble (intro, epigraphs, etc.) -->
				{#if data.book.preamble}
					<div class="mb-12">
						<MarkdownPreview
							content={data.book.preamble}
							projectId={data.book.projectId}
							docMap={docMap()}
						/>
					</div>
				{/if}

				{#if data.chapters.length === 0}
					<p class="font-sans text-sm text-ink-faint dark:text-dark-ink-faint">
						This book has no chapters yet. Add chapter references using <code
							class="rounded bg-paper-ui px-1 font-mono text-xs dark:bg-dark-paper-ui">[[</code
						> in the editor.
					</p>
				{:else}
					<!-- Chapters -->
					{#each data.chapters as chapter, i (chapter.id)}
						<section id="chapter-{chapter.id}" class="mb-16 scroll-mt-20">
							<div class="mb-6 border-b border-paper-border pb-4 dark:border-dark-paper-border">
								<p
									class="mb-1 font-sans text-xs tracking-wider text-ink-faint uppercase dark:text-dark-ink-faint"
								>
									Chapter {i + 1}
								</p>
								<h2
									translate="no"
									class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink"
								>
									{chapter.title}
								</h2>
							</div>

							{#if chapter.content.trim()}
								<MarkdownPreview
									content={chapter.content}
									projectId={data.book.projectId}
									docMap={docMap()}
								/>
							{:else}
								<p class="font-sans text-sm text-ink-faint italic dark:text-dark-ink-faint">
									This chapter has no content yet.
								</p>
							{/if}
						</section>
					{/each}
				{/if}
			</div>
		</main>
	</div>
</div>
