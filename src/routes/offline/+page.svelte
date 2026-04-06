<script lang="ts">
	import { onMount } from 'svelte';
	import { offlineDb, type OfflineIndexEntry } from '$lib/offline.db';

	interface ProjectGroup {
		url: string;
		title: string;
		documents: OfflineIndexEntry[];
	}

	let groups = $state<ProjectGroup[]>([]);
	let loaded = $state(false);

	onMount(async () => {
		const all = await offlineDb.offlineIndex.toArray();

		const projectMap = new Map<string, OfflineIndexEntry>();
		for (const entry of all) {
			if (entry.type === 'project') projectMap.set(entry.url, entry);
		}

		const documents = all.filter((e) => e.type === 'document');

		// Group documents by project
		const byProject = new Map<string, OfflineIndexEntry[]>();
		for (const doc of documents) {
			const projectUrl = doc.projectId ? `/projects/${doc.projectId}` : null;
			const key = projectUrl ?? '__unknown__';
			const list = byProject.get(key) ?? [];
			list.push(doc);
			byProject.set(key, list);
		}

		const result: ProjectGroup[] = [];
		for (const [projectUrl, docs] of byProject) {
			const project = projectMap.get(projectUrl);
			result.push({
				url: projectUrl === '__unknown__' ? '#' : projectUrl,
				title: project?.title ?? 'Project',
				documents: docs.sort((a, b) => b.visitedAt.getTime() - a.visitedAt.getTime())
			});
		}

		// Sort groups by most recently visited document
		result.sort((a, b) => {
			const aTime = a.documents[0]?.visitedAt.getTime() ?? 0;
			const bTime = b.documents[0]?.visitedAt.getTime() ?? 0;
			return bTime - aTime;
		});

		groups = result;
		loaded = true;
	});
</script>

<div class="flex min-h-screen flex-col items-center justify-center gap-6 bg-paper px-6 py-12 text-center dark:bg-dark-paper">
	<svg width="48" height="48" viewBox="0 0 24 24" fill="none" class="text-ink-faint dark:text-dark-ink-faint" aria-hidden="true">
		<path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
	</svg>

	<div class="flex flex-col gap-2">
		<h1 class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">You're offline</h1>
		{#if loaded && groups.length === 0}
			<p class="max-w-sm font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				This page isn't available offline. Check your connection and try again.
			</p>
		{:else}
			<p class="max-w-sm font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				Here's what you have available:
			</p>
		{/if}
	</div>

	{#if loaded && groups.length > 0}
		<div class="w-full max-w-sm text-left">
			{#each groups as group}
				<div class="mb-4">
					<a
						href={group.url}
						class="mb-1 block font-sans text-xs font-semibold uppercase tracking-wide text-ink-muted hover:text-accent dark:text-dark-ink-muted dark:hover:text-accent"
					>
						{group.title}
					</a>
					<ul class="flex flex-col gap-1">
						{#each group.documents as doc}
							<li>
								<a
									href={doc.url}
									class="block rounded-md px-3 py-2 font-sans text-sm text-ink transition-colors hover:bg-paper-ui hover:text-accent dark:text-dark-ink dark:hover:bg-dark-paper-ui dark:hover:text-accent"
								>
									{doc.title}
								</a>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
	{/if}

	<button
		type="button"
		onclick={() => window.location.reload()}
		class="rounded-lg border border-paper-border bg-paper-ui px-4 py-2 font-sans text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink dark:hover:border-accent dark:hover:text-accent"
	>
		Try again
	</button>
</div>
