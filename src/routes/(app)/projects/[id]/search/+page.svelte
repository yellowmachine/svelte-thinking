<script lang="ts">
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Search from '@lucide/svelte/icons/search';
	import type { PageData } from './$types';
	import TutorialManager from '$lib/components/tutorial/TutorialManager.svelte';
	import { projectSearchTutorialSteps } from '$lib/tutorials/projectSearch';

	import { resolve } from '$app/paths';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Search — {data.projectTitle}</title>
</svelte:head>

<div class="mx-auto max-w-2xl px-4 py-10">
	<a
		href={resolve(`/projects/${data.projectId}`)}
		class="mb-6 inline-flex items-center gap-1.5 font-sans text-sm text-ink-faint transition-colors hover:text-ink-muted"
	>
		<ArrowLeft size={14} strokeWidth={1.75} aria-hidden="true" />
		{data.projectTitle}
	</a>

	<form method="GET" class="mb-8">
		<div data-tutorial="project-search-input" class="relative">
			<Search
				size={15}
				strokeWidth={1.75}
				class="absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint"
				aria-hidden="true"
			/>
			<!-- svelte-ignore a11y_autofocus -->
			<input
				type="search"
				name="q"
				value={data.query}
				placeholder="Search in this project…"
				autofocus
				class="w-full rounded-xl border border-paper-border bg-paper py-2.5 pr-4 pl-9 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
			/>
		</div>
	</form>

	{#if data.query && data.results.length === 0}
		<p class="font-sans text-sm text-ink-faint">
			No results for <span class="font-medium text-ink">"{data.query}"</span>. Only committed
			documents are indexed.
		</p>
	{:else if data.results.length > 0}
		<p class="mb-4 font-sans text-xs text-ink-faint">
			{data.results.length}
			{data.results.length === 1 ? 'document' : 'documents'} matching
			<span class="font-medium text-ink">"{data.query}"</span>
		</p>
		<ul data-tutorial="project-search-results" class="flex flex-col gap-3">
			{#each data.results as result (result.document_id)}
				<li>
					<a
						href={resolve(`/projects/${data.projectId}/documents/${result.document_id}`)}
						class="block rounded-xl border border-paper-border bg-paper p-4 transition-colors hover:border-accent/40 hover:bg-paper-ui dark:hover:border-accent/40"
					>
						<p translate="no" class="mb-1.5 font-sans text-sm font-medium text-ink">
							{result.title}
						</p>
						<p translate="no" class="line-clamp-3 font-sans text-xs leading-relaxed text-ink-muted">
							{result.text}
						</p>
						<p class="mt-2 font-sans text-xs text-ink-faint">
							{Math.max(0, Math.round(result.similarity * 100))}% match
						</p>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<TutorialManager
	slug="project-search"
	completedTutorials={data.completedTutorials}
	steps={projectSearchTutorialSteps}
/>
