<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { offlineDb, type OfflineIndexEntry } from '$lib/offline.db';

	interface ProjectGroup {
		url: string;
		title: string;
		documents: OfflineIndexEntry[];
	}

	let groups = $state<ProjectGroup[]>([]);
	let loaded = $state(false);
	let selected = $state<OfflineIndexEntry | null>(null);

	onMount(async () => {
		const all = await offlineDb.offlineIndex.toArray();

		const projectMap = new SvelteMap<string, OfflineIndexEntry>();
		for (const entry of all) {
			if (entry.type === 'project') projectMap.set(entry.url, entry);
		}

		const documents = all.filter((e) => e.type === 'document');

		const byProject = new SvelteMap<string, OfflineIndexEntry[]>();
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

		result.sort((a, b) => {
			const aTime = a.documents[0]?.visitedAt.getTime() ?? 0;
			const bTime = b.documents[0]?.visitedAt.getTime() ?? 0;
			return bTime - aTime;
		});

		groups = result;
		loaded = true;
	});

	async function openDocument(doc: OfflineIndexEntry) {
		// Check pendingEdits first — they have the most recent offline content
		const pending = await offlineDb.pendingEdits
			.where('documentId')
			.equals(doc.url.split('/documents/')[1] ?? '')
			.reverse()
			.sortBy('savedAt');

		const content = pending[0]?.content ?? doc.content ?? null;
		selected = { ...doc, content: content ?? undefined };
	}
</script>

{#if selected}
	<!-- Offline document reader -->
	<div class="flex min-h-screen flex-col bg-paper dark:bg-dark-paper">
		<div
			class="sticky top-0 z-10 flex items-center gap-3 border-b border-paper-border bg-paper px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper"
		>
			<button
				type="button"
				onclick={() => (selected = null)}
				class="flex items-center gap-1.5 font-sans text-sm text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
			>
				<svg
					width="16"
					height="16"
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
				Back
			</button>
			<h1 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">
				{selected.title}
			</h1>
			<span
				class="ml-auto rounded bg-amber-100 px-2 py-0.5 font-sans text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
				>Offline — read only</span
			>
		</div>
		<div class="mx-auto w-full max-w-3xl px-6 py-8">
			{#if selected.content}
				<div
					class="prose prose-sm max-w-none font-serif text-ink dark:text-dark-ink dark:prose-invert"
				>
					<pre
						class="font-serif text-base leading-relaxed whitespace-pre-wrap">{selected.content}</pre>
				</div>
			{:else}
				<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
					No cached content available for this document.
				</p>
			{/if}
		</div>
	</div>
{:else}
	<div
		id="main-content"
		class="flex min-h-screen flex-col items-center justify-center gap-6 bg-paper px-6 py-12 text-center dark:bg-dark-paper"
	>
		<svg
			width="48"
			height="48"
			viewBox="0 0 24 24"
			fill="none"
			class="text-ink-faint dark:text-dark-ink-faint"
			aria-hidden="true"
		>
			<path
				d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
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
				{#each groups as group (group.url)}
					<div class="mb-4">
						<span
							class="mb-1 block font-sans text-xs font-semibold tracking-wide text-ink-muted uppercase dark:text-dark-ink-muted"
						>
							{group.title}
						</span>
						<ul class="flex flex-col gap-1">
							{#each group.documents as doc (doc.url)}
								<li>
									<button
										type="button"
										onclick={() => openDocument(doc)}
										class="block w-full rounded-md px-3 py-2 text-left font-sans text-sm text-ink transition-colors hover:bg-paper-ui hover:text-accent dark:text-dark-ink dark:hover:bg-dark-paper-ui dark:hover:text-accent"
									>
										{doc.title}
									</button>
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
{/if}
