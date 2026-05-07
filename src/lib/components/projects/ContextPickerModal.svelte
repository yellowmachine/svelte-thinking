<script lang="ts">
	import { trpc } from '$lib/utils/trpc';

	type ContextLink = {
		id: string;
		linkedDocumentId: string;
		docTitle: string;
		docType: string;
		sourceProjectId: string;
		sourceProjectTitle: string;
	};
	type AvailableDoc = {
		id: string;
		title: string;
		type: string;
		projectId: string;
		isPublic: boolean;
		projectTitle: string | null;
	};

	let {
		projectId,
		contextLinks,
		onclose,
		onadd
	}: {
		projectId: string;
		contextLinks: ContextLink[];
		onclose: () => void;
		onadd: (docId: string) => Promise<void>;
	} = $props();

	let availableDocs = $state<AvailableDoc[]>([]);
	let contextPickerSearch = $state('');
	let loadingAvailable = $state(false);

	const filteredAvailable = $derived.by(() => {
		const q = contextPickerSearch.toLowerCase().trim();
		const linkedIds = new Set(contextLinks.map((l) => l.linkedDocumentId));
		const unlinked = availableDocs.filter((d) => !linkedIds.has(d.id));
		if (!q) return unlinked;
		return unlinked.filter(
			(d) => d.title.toLowerCase().includes(q) || (d.projectTitle?.toLowerCase() ?? '').includes(q)
		);
	});

	const availableByProject = $derived.by(() => {
		const groups = new Map<string, { title: string; docs: AvailableDoc[] }>();
		const publicOthers: AvailableDoc[] = [];

		for (const doc of filteredAvailable) {
			if (doc.projectTitle !== null) {
				if (!groups.has(doc.projectId)) {
					groups.set(doc.projectId, { title: doc.projectTitle, docs: [] });
				}
				groups.get(doc.projectId)!.docs.push(doc);
			} else {
				publicOthers.push(doc);
			}
		}

		const result = [...groups.entries()].map(([id, g]) => ({ id, ...g }));
		if (publicOthers.length > 0) {
			result.push({
				id: '__public__',
				title: 'Public documents from other users',
				docs: publicOthers
			});
		}
		return result;
	});

	$effect(() => {
		loadingAvailable = true;
		trpc.contextLinks.listAvailable
			.query(projectId)
			.then((docs) => {
				availableDocs = docs as AvailableDoc[];
			})
			.finally(() => {
				loadingAvailable = false;
			});
	});
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
	<div
		class="flex w-full max-w-md flex-col rounded-2xl border border-paper-border bg-paper shadow-2xl dark:border-dark-paper-border dark:bg-dark-paper"
		style="max-height: 80vh"
		role="dialog"
		aria-modal="true"
		aria-labelledby="context-picker-title"
	>
		<div
			class="flex items-center justify-between border-b border-paper-border px-5 py-4 dark:border-dark-paper-border"
		>
			<h2
				id="context-picker-title"
				class="font-serif text-base font-semibold text-ink dark:text-dark-ink"
			>
				Add external context
			</h2>
			<button
				onclick={() => {
					contextPickerSearch = '';
					onclose();
				}}
				class="rounded-md p-1 text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
				aria-label="Close"
			>
				<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
					<path
						d="M1 1l12 12M13 1L1 13"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
					/>
				</svg>
			</button>
		</div>

		<div class="px-5 pt-3">
			<input
				type="search"
				bind:value={contextPickerSearch}
				placeholder="Search documents or projects…"
				class="w-full rounded-lg border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
			/>
		</div>

		<div class="flex-1 overflow-y-auto px-5 py-3">
			{#if loadingAvailable}
				<p class="py-4 text-center font-sans text-sm text-ink-faint dark:text-dark-ink-faint">
					Loading…
				</p>
			{:else if availableByProject.length === 0}
				<p class="py-4 text-center font-sans text-sm text-ink-faint dark:text-dark-ink-faint">
					{availableDocs.length === 0
						? 'No documents in other projects'
						: 'All documents already added'}
				</p>
			{:else}
				{#each availableByProject as group (group.id)}
					<div class="mb-3">
						<p
							class="mb-1 font-sans text-[11px] font-semibold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint"
						>
							{group.title}
						</p>
						{#each group.docs as doc (doc.id)}
							<div
								class="flex items-center gap-1 rounded-lg px-1 transition-colors hover:bg-paper-ui dark:hover:bg-dark-paper-ui"
							>
								<button
									onclick={async () => onadd(doc.id)}
									class="flex min-w-0 flex-1 items-center gap-2 py-2 pl-2 text-left"
								>
									<span
										class="min-w-0 flex-1 truncate font-sans text-sm text-ink dark:text-dark-ink"
										>{doc.title}</span
									>
									{#if doc.isPublic && doc.projectTitle === null}
										<svg
											width="11"
											height="11"
											viewBox="0 0 24 24"
											fill="none"
											class="shrink-0 text-green-500"
											aria-label="Public"
										>
											<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5" />
											<path
												d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"
												stroke="currentColor"
												stroke-width="1.5"
												stroke-linecap="round"
											/>
										</svg>
									{/if}
									<span
										class="shrink-0 rounded-full bg-paper-ui px-2 py-0.5 font-sans text-[10px] text-ink-faint dark:bg-dark-paper-ui dark:text-dark-ink-faint"
										>{doc.type}</span
									>
								</button>
								{#if doc.isPublic && doc.projectTitle === null}
									<button
										onclick={(e) => {
											e.stopPropagation();
											navigator.clipboard.writeText(`[[${doc.title}:${doc.id.slice(0, 8)}]]`);
										}}
										title="Copy wikilink syntax"
										class="shrink-0 rounded px-1.5 py-1 font-mono text-[10px] text-ink-faint transition-colors hover:bg-paper-border hover:text-accent dark:text-dark-ink-faint dark:hover:bg-dark-paper-border"
										>[[·]]</button
									>
								{/if}
							</div>
						{/each}
					</div>
				{/each}
			{/if}
		</div>
	</div>
</div>
