<script lang="ts">
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { invalidateAll } from '$app/navigation';
	import { trpc } from '$lib/utils/trpc';
	import { parseBibtexFile } from '$lib/utils/bibtex';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let query = $state('');

	type Ref = (typeof data.references)[0];

	function authorString(authors: Ref['authors']): string {
		if (!authors || authors.length === 0) return '';
		return authors.map((a) => `${a.last}, ${a.first}`).join('; ');
	}

	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return data.references;
		return data.references.filter((r) => {
			return (
				r.title.toLowerCase().includes(q) ||
				r.citeKey.toLowerCase().includes(q) ||
				authorString(r.authors).toLowerCase().includes(q) ||
				(r.projectTitle ?? '').toLowerCase().includes(q) ||
				(r.year ?? '').includes(q) ||
				(r.journal ?? '').toLowerCase().includes(q) ||
				(r.booktitle ?? '').toLowerCase().includes(q)
			);
		});
	});

	// Group by project (references without a project go under a fallback group)
	const byProject = $derived.by(() => {
		const map = new SvelteMap<
			string,
			{
				projectId: string | null;
				projectTitle: string;
				bibHref: string | null;
				refs: (Ref & { externalHref: string | null })[];
			}
		>();
		for (const r of filtered) {
			const key = r.projectId ?? '__none__';
			if (!map.has(key)) {
				map.set(key, {
					projectId: r.projectId,
					projectTitle: r.projectTitle ?? 'Sin proyecto',
					bibHref: r.projectId ? resolve(`/projects/${r.projectId}/bib`) : null,
					refs: []
				});
			}
			const externalHref = r.doi ? `https://doi.org/${r.doi}` : (r.url ?? null);
			map.get(key)!.refs.push({ ...r, externalHref });
		}
		return [...map.values()].sort((a, b) => a.projectTitle.localeCompare(b.projectTitle));
	});

	// ── Import .bib modal ───────────────────────────────────────────────────

	let showImport = $state(false);
	let importRaw = $state('');
	let importing = $state(false);
	let importResult = $state<{ inserted: number; skipped: number } | null>(null);
	let importError = $state('');

	function importPreview(): number {
		try {
			return parseBibtexFile(importRaw).length;
		} catch {
			return 0;
		}
	}

	async function runImport() {
		if (!importRaw.trim()) return;
		importing = true;
		importResult = null;
		importError = '';
		try {
			const result = await trpc.references.importBibtex.mutate({ raw: importRaw });
			importResult = result;
			await invalidateAll();
		} catch (e) {
			importError = e instanceof Error ? e.message : 'Import failed.';
		} finally {
			importing = false;
		}
	}

	let deleting = new SvelteSet<string>();

	async function deleteRef(id: string) {
		deleting.add(id);
		try {
			await trpc.references.delete.mutate(id);
			await invalidateAll();
		} finally {
			deleting.delete(id);
		}
	}

	function typeLabel(type: string): string {
		const labels: Record<string, string> = {
			article: 'Article',
			book: 'Libro',
			inproceedings: 'Conferencia',
			incollection: 'Chapter',
			phdthesis: 'Tesis doctoral',
			mastersthesis: "Master's thesis",
			techreport: 'Technical report',
			misc: 'Miscellaneous'
		};
		return labels[type] ?? type;
	}
</script>

<svelte:head>
	<title>Global bibliography · Scholio</title>
</svelte:head>

<div class="mx-auto max-w-4xl px-6 py-8">
	<div class="mb-6 flex items-start justify-between gap-4">
		<div>
			<h1 class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">
				Global bibliography
			</h1>
			<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				{data.references.length} referencia{data.references.length !== 1 ? 's' : ''} en todos tus proyectos
			</p>
		</div>
		<button
			onclick={() => {
				showImport = true;
				importRaw = '';
				importResult = null;
				importError = '';
			}}
			class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
		>
			Import .bib
		</button>
	</div>

	<!-- Search -->
	<div class="mb-6">
		<input
			type="search"
			bind:value={query}
			placeholder="Search by title, author, key, project…"
			class="w-full rounded-lg border border-paper-border bg-paper px-4 py-2.5 font-sans text-sm text-ink placeholder-ink-faint outline-none focus:border-accent focus:ring-1 focus:ring-accent dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink dark:placeholder-dark-ink-faint dark:focus:border-accent"
		/>
	</div>

	{#if data.references.length === 0}
		<div
			class="rounded-lg border border-paper-border bg-paper p-8 text-center dark:border-dark-paper-border dark:bg-dark-paper"
		>
			<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				No references yet. Add them from the
				<strong>Bibliography</strong> section of each project.
			</p>
		</div>
	{:else if filtered.length === 0}
		<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Sin resultados para <em>"{query}"</em>.
		</p>
	{:else}
		<div class="space-y-8">
			{#each byProject as group (group.projectId)}
				<section>
					<div class="mb-3 flex items-center justify-between">
						<h2
							class="font-sans text-xs font-semibold tracking-wider text-ink-muted uppercase dark:text-dark-ink-muted"
						>
							{group.projectTitle}
						</h2>
						{#if group.bibHref}
							<a href={group.bibHref} class="font-sans text-xs text-accent hover:underline">
								Ver en proyecto →
							</a>
						{/if}
					</div>

					<div
						class="divide-y divide-paper-border rounded-lg border border-paper-border dark:divide-dark-paper-border dark:border-dark-paper-border"
					>
						{#each group.refs as ref (ref.id)}
							<div class="px-4 py-3">
								<div class="flex items-start justify-between gap-3">
									<div class="min-w-0 flex-1">
										<p class="font-sans text-sm font-medium text-ink dark:text-dark-ink">
											{ref.title}
										</p>
										{#if ref.authors && ref.authors.length > 0}
											<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
												{authorString(ref.authors)}{ref.year ? ` (${ref.year})` : ''}
											</p>
										{/if}
										{#if ref.journal || ref.booktitle}
											<p
												class="mt-0.5 font-sans text-xs text-ink-faint italic dark:text-dark-ink-faint"
											>
												{ref.journal ?? ref.booktitle}
											</p>
										{/if}
									</div>
									<div class="flex shrink-0 items-center gap-2">
										<span
											class="rounded-full bg-paper-ui px-2 py-0.5 font-sans text-[10px] text-ink-muted dark:bg-dark-paper-ui dark:text-dark-ink-muted"
										>
											{typeLabel(ref.type)}
										</span>
										<code class="font-mono text-[11px] text-accent">@{ref.citeKey}</code>
										{#if ref.externalHref}
											<a
												href={ref.externalHref}
												target="_blank"
												rel="noopener noreferrer"
												class="font-sans text-xs text-accent hover:underline"
											>
												{ref.doi ? 'DOI' : 'URL'}
											</a>
										{/if}
										{#if ref.projectId === null}
											<button
												type="button"
												onclick={() => deleteRef(ref.id)}
												disabled={deleting.has(ref.id)}
												aria-label="Borrar referencia"
												class="rounded p-0.5 text-ink-faint hover:text-red-500 disabled:opacity-40"
											>
												<svg
													width="13"
													height="13"
													viewBox="0 0 14 14"
													fill="none"
													aria-hidden="true"
												>
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
								</div>
							</div>
						{/each}
					</div>
				</section>
			{/each}
		</div>
	{/if}
</div>

{#if showImport}
	<div
		class="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-20 backdrop-blur-sm"
		role="dialog"
		aria-modal="true"
		aria-labelledby="import-bib-title"
	>
		<div
			class="flex w-full max-w-xl flex-col gap-4 rounded-2xl border border-paper-border bg-paper p-6 shadow-xl dark:border-dark-paper-border dark:bg-dark-paper"
		>
			<div class="flex items-center justify-between">
				<h2
					id="import-bib-title"
					class="font-serif text-lg font-semibold text-ink dark:text-dark-ink"
				>
					Import .bib
				</h2>
				<button
					onclick={() => (showImport = false)}
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

			<textarea
				bind:value={importRaw}
				placeholder="Paste BibTeX content here…"
				rows="12"
				class="w-full resize-y rounded-lg border border-paper-border bg-paper-ui px-3 py-2 font-mono text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
			></textarea>

			{#if importRaw.trim()}
				<p class="font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					{importPreview()} entr{importPreview() === 1 ? 'y' : 'ies'} detected
				</p>
			{/if}

			{#if importResult}
				<div
					class="rounded-lg border border-green-200 bg-green-50 px-3 py-2 dark:border-green-800/40 dark:bg-green-950/30"
				>
					<p class="font-sans text-sm text-green-700 dark:text-green-400">
						✓ {importResult.inserted}
						{importResult.inserted === 1 ? 'reference imported' : 'references imported'}
						{#if importResult.skipped > 0}· {importResult.skipped} skipped (already in library){/if}
					</p>
				</div>
			{/if}

			{#if importError}
				<p
					class="rounded-lg bg-red-50 px-3 py-2 font-sans text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400"
				>
					{importError}
				</p>
			{/if}

			<div class="flex justify-end gap-2">
				<button
					onclick={() => (showImport = false)}
					class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted"
				>
					Close
				</button>
				<button
					onclick={runImport}
					disabled={importing || !importRaw.trim()}
					class="rounded-md bg-accent px-3 py-1.5 font-sans text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
				>
					{importing ? 'Importing…' : `Import${importPreview() > 0 ? ` ${importPreview()}` : ''}`}
				</button>
			</div>
		</div>
	</div>
{/if}
