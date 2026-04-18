<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import { resolve } from '$app/paths';
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
		const map = new SvelteMap<string, { projectId: string | null; projectTitle: string; bibHref: string | null; refs: (Ref & { externalHref: string | null })[]}>();
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

	function typeLabel(type: string): string {
		const labels: Record<string, string> = {
			article: 'Article',
			book: 'Libro',
			inproceedings: 'Conferencia',
			incollection: 'Chapter',
			phdthesis: 'Tesis doctoral',
			mastersthesis: 'Master\'s thesis',
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
		<div class="rounded-lg border border-paper-border bg-paper p-8 text-center dark:border-dark-paper-border dark:bg-dark-paper">
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
						<h2 class="font-sans text-xs font-semibold uppercase tracking-wider text-ink-muted dark:text-dark-ink-muted">
							{group.projectTitle}
						</h2>
						{#if group.bibHref}
						<a
							href={resolve(group.bibHref)}
							class="font-sans text-xs text-accent hover:underline"
						>
							Ver en proyecto →
						</a>
					{/if}
					</div>

					<div class="divide-y divide-paper-border rounded-lg border border-paper-border dark:divide-dark-paper-border dark:border-dark-paper-border">
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
											<p class="mt-0.5 font-sans text-xs italic text-ink-faint dark:text-dark-ink-faint">
												{ref.journal ?? ref.booktitle}
											</p>
										{/if}
									</div>
									<div class="flex shrink-0 items-center gap-2">
										<span class="rounded-full bg-paper-ui px-2 py-0.5 font-sans text-[10px] text-ink-muted dark:bg-dark-paper-ui dark:text-dark-ink-muted">
											{typeLabel(ref.type)}
										</span>
										<code class="font-mono text-[11px] text-accent">@{ref.citeKey}</code>
										{#if ref.externalHref}
											<a
												href={resolve(ref.externalHref)}
												target="_blank"
												rel="noopener noreferrer"
												class="font-sans text-xs text-accent hover:underline"
											>
												{ref.doi ? 'DOI' : 'URL'}
											</a>
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
