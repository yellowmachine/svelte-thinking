<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Search — {data.projectTitle}</title>
</svelte:head>

<div class="mx-auto max-w-2xl px-4 py-10">
	<a
		href="/projects/{data.projectId}"
		class="mb-6 inline-flex items-center gap-1.5 font-sans text-sm text-ink-faint transition-colors hover:text-ink-muted dark:text-dark-ink-faint dark:hover:text-dark-ink-muted"
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
			<path d="M19 12H5M12 5l-7 7 7 7" />
		</svg>
		{data.projectTitle}
	</a>

	<form method="GET" class="mb-8">
		<div class="relative">
			<svg
				width="15"
				height="15"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint dark:text-dark-ink-faint"
				aria-hidden="true"
			>
				<circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
			</svg>
			<input
				type="search"
				name="q"
				value={data.query}
				placeholder="Search in this project…"
				autofocus
				class="w-full rounded-xl border border-paper-border bg-paper py-2.5 pr-4 pl-9 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink dark:placeholder:text-dark-ink-faint"
			/>
		</div>
	</form>

	{#if data.query && data.results.length === 0}
		<p class="font-sans text-sm text-ink-faint dark:text-dark-ink-faint">
			No results for <span class="font-medium text-ink dark:text-dark-ink">"{data.query}"</span>.
			Only committed documents are indexed.
		</p>
	{:else if data.results.length > 0}
		<p class="mb-4 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
			{data.results.length}
			{data.results.length === 1 ? 'document' : 'documents'} matching
			<span class="font-medium text-ink dark:text-dark-ink">"{data.query}"</span>
		</p>
		<ul class="flex flex-col gap-3">
			{#each data.results as result (result.document_id)}
				<li>
					<a
						href="/projects/{data.projectId}/documents/{result.document_id}"
						class="block rounded-xl border border-paper-border bg-paper p-4 transition-colors hover:border-accent/40 hover:bg-paper-ui dark:border-dark-paper-border dark:bg-dark-paper dark:hover:border-accent/40 dark:hover:bg-dark-paper-ui"
					>
						<p class="mb-1.5 font-sans text-sm font-medium text-ink dark:text-dark-ink">
							{result.title}
						</p>
						<p
							class="line-clamp-3 font-sans text-xs leading-relaxed text-ink-muted dark:text-dark-ink-muted"
						>
							{result.text}
						</p>
						<p class="mt-2 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
							{Math.max(0, Math.round(result.similarity * 100))}% match
						</p>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>
