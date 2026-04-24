<script lang="ts">
	import { onMount } from 'svelte';
	import { pouchStore, type OfflineDoc } from '$lib/offline/pouch.svelte';

	interface ProjectGroup {
		projectId: string;
		documents: OfflineDoc[];
	}

	let groups = $state<ProjectGroup[]>([]);
	let loaded = $state(false);
	let selected = $state<OfflineDoc | null>(null);

	onMount(async () => {
		const docs = await pouchStore.listDocuments();

		const byProject = new Map<string, OfflineDoc[]>();
		for (const doc of docs) {
			const list = byProject.get(doc.projectId) ?? [];
			list.push(doc);
			byProject.set(doc.projectId, list);
		}

		groups = [...byProject.entries()]
			.map(([projectId, documents]) => ({
				projectId,
				documents: documents.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
			}))
			.sort((a, b) => (b.documents[0]?.updatedAt ?? '').localeCompare(a.documents[0]?.updatedAt ?? ''));

		loaded = true;
	});
</script>

{#if selected}
	<div class="flex min-h-screen flex-col bg-paper dark:bg-dark-paper">
		<div class="sticky top-0 z-10 flex items-center gap-3 border-b border-paper-border bg-paper px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper">
			<button
				type="button"
				onclick={() => (selected = null)}
				class="flex items-center gap-1.5 font-sans text-sm text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M19 12H5M12 5l-7 7 7 7"/>
				</svg>
				Back
			</button>
			<h1 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">{selected.title}</h1>
			<span class="ml-auto rounded bg-amber-100 px-2 py-0.5 font-sans text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Offline — read only</span>
		</div>
		<div class="mx-auto w-full max-w-3xl px-6 py-8">
			{#if selected.content}
				<div class="prose prose-sm dark:prose-invert max-w-none font-serif text-ink dark:text-dark-ink">
					<pre class="whitespace-pre-wrap font-serif text-base leading-relaxed">{selected.content}</pre>
				</div>
			{:else}
				<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
					No cached content available for this document.
				</p>
			{/if}
		</div>
	</div>
{:else}
	<div id="main-content" class="flex min-h-screen flex-col items-center justify-center gap-6 bg-paper px-6 py-12 text-center dark:bg-dark-paper">
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
						<span class="mb-1 block font-sans text-xs font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-ink-muted">
							{group.projectId}
						</span>
						<ul class="flex flex-col gap-1">
							{#each group.documents as doc}
								<li>
									<button
										type="button"
										onclick={() => (selected = doc)}
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
