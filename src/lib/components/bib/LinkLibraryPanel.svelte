<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { trpc } from '$lib/utils/trpc';
	import type { Author } from '$lib/utils/bibtex';

	type LibraryRef = {
		id: string;
		citeKey: string;
		type: string;
		title: string;
		authors: unknown;
		year: string | null;
		projectIds: string[];
	};

	type LinkedRef = {
		id: string;
		citeKey: string;
		title: string;
		authors: unknown;
		year: string | null;
	};

	let {
		projectId,
		linkedRefs,
		onclose,
		onlinked
	}: {
		projectId: string;
		linkedRefs: LinkedRef[];
		onclose: () => void;
		onlinked: () => Promise<void>;
	} = $props();

	let llRefs = $state<LibraryRef[]>([]);
	let llSelectedIds = $state<Set<string>>(new Set());
	let llSearch = $state('');
	let llFilterProjectId = $state('');
	let llProjects = $state<{ id: string; title: string }[]>([]);
	let llLoading = $state(false);
	let llLinking = $state(false);
	let llDeleting = new SvelteSet<string>();
	let llError = $state('');
	let llShowLinked = $state(false);

	const llFiltered = $derived.by(() => {
		const q = llSearch.toLowerCase().trim();
		return llRefs.filter((r) => {
			if (llFilterProjectId === '__unlinked__' && r.projectIds.length > 0) return false;
			if (
				llFilterProjectId &&
				llFilterProjectId !== '__unlinked__' &&
				!r.projectIds.includes(llFilterProjectId)
			)
				return false;
			if (!q) return true;
			return (
				r.citeKey.toLowerCase().includes(q) ||
				r.title.toLowerCase().includes(q) ||
				r.year?.includes(q) ||
				(r.authors as Author[]).some(
					(a) => a.last.toLowerCase().includes(q) || a.first.toLowerCase().includes(q)
				)
			);
		});
	});

	// Load library refs on mount
	$effect(() => {
		loadLibrary();
	});

	async function loadLibrary() {
		llSelectedIds = new Set();
		llSearch = '';
		llFilterProjectId = '';
		llError = '';
		llShowLinked = false;
		llLoading = true;
		try {
			type RawRef = {
				id: string;
				projectId: string | null;
				citeKey: string;
				type: string;
				title: string;
				authors: unknown;
				year: string | null;
			};
			const [allRaw, allProjects] = await Promise.all([
				trpc.references.listAll.query(),
				trpc.projects.list.query()
			]);
			const all = allRaw as unknown as RawRef[];
			llProjects = (allProjects as { id: string; title: string }[]).filter(
				(p) => p.id !== projectId
			);
			const projectRefIds = new Set(linkedRefs.map((r) => r.id));
			const projectIdsMap = new Map<string, string[]>();
			for (const r of all) {
				if (!projectIdsMap.has(r.id)) projectIdsMap.set(r.id, []);
				if (r.projectId) projectIdsMap.get(r.id)!.push(r.projectId);
			}
			const seen = new Set<string>();
			llRefs = all
				.filter((r) => {
					if (projectRefIds.has(r.id) || seen.has(r.id)) return false;
					seen.add(r.id);
					return true;
				})
				.map((r) => ({ ...r, projectIds: projectIdsMap.get(r.id) ?? [] }));
		} catch {
			llError = 'Could not load your library.';
		} finally {
			llLoading = false;
		}
	}

	function llToggleAll() {
		if (llSelectedIds.size === llFiltered.length) {
			llSelectedIds = new Set();
		} else {
			llSelectedIds = new Set(llFiltered.map((r) => r.id));
		}
	}

	async function llDeleteRef(id: string) {
		llDeleting.add(id);
		try {
			await trpc.references.delete.mutate(id);
			llRefs = llRefs.filter((r) => r.id !== id);
		} catch {
			llError = 'Failed to delete reference.';
		} finally {
			llDeleting.delete(id);
		}
	}

	async function runLinkLibrary() {
		if (llSelectedIds.size === 0) return;
		llLinking = true;
		llError = '';
		try {
			await Promise.all(
				[...llSelectedIds].map((referenceId) =>
					trpc.references.attachToProject.mutate({ referenceId, projectId })
				)
			);
			await onlinked();
		} catch (e) {
			llError = e instanceof Error ? e.message : 'Failed to link references.';
		} finally {
			llLinking = false;
		}
	}
</script>

<div class="w-full max-w-sm shrink-0">
	<div
		class="sticky top-20 overflow-hidden rounded-2xl border border-paper-border bg-paper dark:border-dark-paper-border dark:bg-dark-paper"
	>
		<div
			class="flex items-center justify-between border-b border-paper-border px-5 py-3.5 dark:border-dark-paper-border"
		>
			<h2 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">
				Link from library
			</h2>
			<button
				onclick={onclose}
				aria-label="Close"
				class="rounded-md p-1 text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
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

		<div class="space-y-3 px-5 py-4">
			{#if llLoading}
				<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">Loading library…</p>
			{:else if llRefs.length === 0 && !llError}
				<p class="font-sans text-sm text-ink-faint dark:text-dark-ink-faint">
					No other references in your library to link.
				</p>
			{:else}
				{#if llProjects.length > 0 || llRefs.some((r) => r.projectIds.length === 0)}
					<select
						bind:value={llFilterProjectId}
						class="w-full rounded-md border border-paper-border bg-paper-ui px-3 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
					>
						<option value="">All library</option>
						{#each llProjects as p (p.id)}
							<option value={p.id}>{p.title}</option>
						{/each}
						<option value="__unlinked__">Sin proyecto</option>
					</select>
				{/if}
				<input
					type="search"
					bind:value={llSearch}
					placeholder="Search by author, title, year…"
					class="w-full rounded-md border border-paper-border bg-paper-ui px-3 py-1.5 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
				/>
				<div class="flex items-center justify-between">
					<span class="font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
						{llSelectedIds.size} / {llFiltered.length} selected
					</span>
					<button
						type="button"
						onclick={llToggleAll}
						class="font-sans text-xs text-accent hover:underline"
					>
						{llSelectedIds.size === llFiltered.length && llFiltered.length > 0
							? 'Deselect all'
							: 'Select all'}
					</button>
				</div>
				<div
					class="max-h-72 overflow-y-auto rounded-md border border-paper-border dark:border-dark-paper-border"
				>
					{#each llFiltered as ref (ref.id)}
						{@const author = (ref.authors as Author[])[0]?.last ?? ''}
						{@const isOrphan = ref.projectIds.length === 0}
						<div
							class="flex items-start gap-2.5 border-b border-paper-border px-3 py-2.5 last:border-b-0 hover:bg-paper-ui dark:border-dark-paper-border dark:hover:bg-dark-paper-ui"
						>
							<label class="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5">
								<input
									type="checkbox"
									checked={llSelectedIds.has(ref.id)}
									onchange={() => {
										const next = new Set(llSelectedIds);
										if (next.has(ref.id)) next.delete(ref.id);
										else next.add(ref.id);
										llSelectedIds = next;
									}}
									class="mt-0.5 shrink-0 accent-accent"
								/>
								<div class="min-w-0">
									<p class="truncate font-sans text-xs font-medium text-ink dark:text-dark-ink">
										{ref.title}
									</p>
									<p class="font-sans text-[11px] text-ink-faint dark:text-dark-ink-faint">
										{[author, ref.year].filter(Boolean).join(', ')}
										<span class="ml-1 font-mono opacity-60">{ref.citeKey}</span>
										{#if isOrphan}<span class="ml-1 italic opacity-60">sin proyecto</span>{/if}
									</p>
								</div>
							</label>
							{#if isOrphan}
								<button
									type="button"
									onclick={() => llDeleteRef(ref.id)}
									disabled={llDeleting.has(ref.id)}
									aria-label="Borrar referencia"
									class="mt-0.5 shrink-0 rounded p-0.5 text-ink-faint hover:text-red-500 disabled:opacity-40"
								>
									<svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
										<path
											d="M2 4h10M5 4V2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5V4M6 7v3M8 7v3M3 4l.8 7.2A1 1 0 0 0 4.8 12h4.4a1 1 0 0 0 1-.8L11 4"
											stroke="currentColor"
											stroke-width="1.3"
											stroke-linecap="round"
											stroke-linejoin="round"
										/>
									</svg>
								</button>
							{/if}
						</div>
					{/each}
					{#if llFiltered.length === 0}
						<p class="px-3 py-4 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
							No results for "{llSearch}"
						</p>
					{/if}
				</div>
			{/if}

			{#if linkedRefs.length > 0}
				<button
					type="button"
					onclick={() => (llShowLinked = !llShowLinked)}
					class="flex w-full items-center gap-1.5 font-sans text-xs text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
				>
					<svg
						width="10"
						height="10"
						viewBox="0 0 10 10"
						fill="none"
						aria-hidden="true"
						class="shrink-0 transition-transform {llShowLinked ? 'rotate-90' : ''}"
					>
						<path
							d="M3 1.5l4 3.5-4 3.5"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					Already in this project ({linkedRefs.length})
				</button>
				{#if llShowLinked}
					<div class="rounded-md border border-paper-border dark:border-dark-paper-border">
						{#each linkedRefs as ref (ref.id)}
							{@const author = (ref.authors as Author[])[0]?.last ?? ''}
							<div
								class="flex items-start gap-2.5 border-b border-paper-border px-3 py-2 opacity-50 last:border-b-0 dark:border-dark-paper-border"
							>
								<div class="min-w-0">
									<p class="truncate font-sans text-xs font-medium text-ink dark:text-dark-ink">
										{ref.title}
									</p>
									<p class="font-sans text-[11px] text-ink-faint dark:text-dark-ink-faint">
										{[author, ref.year].filter(Boolean).join(', ')}
										<span class="ml-1 font-mono opacity-60">{ref.citeKey}</span>
									</p>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			{/if}

			{#if llError}
				<p
					class="rounded-lg bg-red-50 px-3 py-2 font-sans text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400"
				>
					{llError}
				</p>
			{/if}
		</div>

		<div
			class="flex justify-end gap-2 border-t border-paper-border px-5 py-3 dark:border-dark-paper-border"
		>
			<button
				onclick={onclose}
				class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted"
			>
				Cancel
			</button>
			<button
				onclick={runLinkLibrary}
				disabled={llLinking || llSelectedIds.size === 0}
				class="rounded-md bg-accent px-3 py-1.5 font-sans text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
			>
				{llLinking ? 'Linking…' : `Link${llSelectedIds.size > 0 ? ` ${llSelectedIds.size}` : ''}`}
			</button>
		</div>
	</div>
</div>
