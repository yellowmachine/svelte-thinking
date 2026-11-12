<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	type Props = { projectId: string; projectTitle: string };
	let { projectId, projectTitle }: Props = $props();

	// Every section of a project, always in the same place. Before, some were in
	// the sidebar (which drops below the documents on narrow screens) and some,
	// like Review and Search, only behind buttons on the project page.
	const TABS = [
		{ path: '', label: 'Documents' },
		{ path: '/bib', label: 'Bibliography' },
		{ path: '/requirements', label: 'Requirements' },
		{ path: '/review', label: 'Review' },
		{ path: '/issues', label: 'Issues' },
		{ path: '/ai', label: 'Assistant' },
		{ path: '/search', label: 'Search' },
		{ path: '/datasets', label: 'Datasets' },
		{ path: '/photos', label: 'Photos' },
		{ path: '/notebooks', label: 'Notebooks' }
	] as const;

	const base = $derived(`/projects/${projectId}`);

	function isActive(path: string): boolean {
		const current = page.url.pathname;
		if (path === '') return current === base;
		return current === base + path || current.startsWith(`${base}${path}/`);
	}
</script>

<div class="shrink-0 border-b border-paper-border bg-paper">
	<div class="mx-auto flex max-w-7xl items-center gap-4 px-6">
		<a
			href={resolve(`/projects/${projectId}`)}
			translate="no"
			class="hidden max-w-48 shrink-0 truncate py-2.5 font-serif text-sm font-semibold text-ink hover:text-accent-ink md:block"
		>
			{projectTitle}
		</a>
		<nav aria-label="Project sections" class="-mb-px flex min-w-0 gap-1 overflow-x-auto">
			{#each TABS as tab (tab.path)}
				<a
					href={resolve(`/projects/${projectId}${tab.path}` as `/projects/${string}`)}
					aria-current={isActive(tab.path) ? 'page' : undefined}
					class="shrink-0 border-b-2 border-transparent px-2.5 py-2.5 font-sans text-sm whitespace-nowrap text-ink-muted transition-colors hover:text-ink aria-[current=page]:border-accent aria-[current=page]:font-medium aria-[current=page]:text-ink"
				>
					{tab.label}
				</a>
			{/each}
		</nav>
	</div>
</div>
