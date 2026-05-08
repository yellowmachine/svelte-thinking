<script lang="ts">
	/* eslint-disable @typescript-eslint/no-explicit-any */
	import { SvelteSet } from 'svelte/reactivity';
	import { trpc } from '$lib/utils/trpc';
	import { CITATION_STYLE_LABELS, type CitationStyle } from '$lib/utils/citations';
	import type { PageData } from './$types';
	import SafeDeleteDialog from '$lib/components/ui/SafeDeleteDialog.svelte';
	import DoiLookupPanel from '$lib/components/bib/DoiLookupPanel.svelte';
	import UrlLookupPanel from '$lib/components/bib/UrlLookupPanel.svelte';
	import ImportBibPanel from '$lib/components/bib/ImportBibPanel.svelte';
	import LinkLibraryPanel from '$lib/components/bib/LinkLibraryPanel.svelte';
	import ReferenceFormPanel from '$lib/components/bib/ReferenceFormPanel.svelte';
	import SemanticSearchModal from '$lib/components/bib/SemanticSearchModal.svelte';
	import BibReferenceList from '$lib/components/bib/BibReferenceList.svelte';
	import { goto } from '$app/navigation';
	import { flash } from '$lib/stores/flash.svelte';
	import TutorialManager from '$lib/components/tutorial/TutorialManager.svelte';
	import { projectBibTutorialSteps } from '$lib/tutorials/projectBib';

	import { resolve } from '$app/paths';
	// ── Citation style ────────────────────────────────────────────────────────

	let citationStyle = $state<CitationStyle>('apa');

	let { data }: { data: PageData } = $props();

	// ── State ────────────────────────────────────────────────────────────────

	type Ref = (typeof data.references)[number];

	let references = $derived(data.references);
	let searchQuery = $state('');

	// Filtered list (client-side, instant)
	const filtered = $derived(() => {
		const q = searchQuery.toLowerCase().trim();
		if (!q) return references;
		return references.filter(
			(r) =>
				r.citeKey.toLowerCase().includes(q) ||
				r.title.toLowerCase().includes(q) ||
				r.year?.includes(q) ||
				(r.authors as { first: string; last: string }[]).some(
					(a) => a.last.toLowerCase().includes(q) || a.first.toLowerCase().includes(q)
				) ||
				r.journal?.toLowerCase().includes(q) ||
				r.booktitle?.toLowerCase().includes(q)
		);
	});

	let generatingPdfIds = new SvelteSet<string>();

	// ── Semantic Scholar ────────────────────────────────────────────────────
	let showSemanticSearch = $state(false);

	// ── Side panel (create / edit) ───────────────────────────────────────────

	type Panel = 'closed' | 'new' | 'edit' | 'import' | 'link-library' | 'doi' | 'url' | null;
	let panel = $state<Panel>('closed');
	let editingRef = $state<Ref | null>(null);

	function openNew() {
		editingRef = null;
		panel = 'new';
	}

	function openEdit(ref: Ref) {
		editingRef = ref;
		panel = 'edit';
	}

	function closePanel() {
		panel = 'closed';
		editingRef = null;
	}

	let refToDelete = $state<Ref | null>(null);
	let deletingRef = $state(false);

	async function confirmDeleteRef() {
		if (!refToDelete) return;
		deletingRef = true;
		try {
			await trpc.references.detachFromProject.mutate({
				referenceId: refToDelete.id,
				projectId: data.project.id
			});
			references = references.filter((r) => r.id !== refToDelete!.id);
		} catch {
			/* non-critical */
		} finally {
			deletingRef = false;
			refToDelete = null;
		}
	}

	// ── Export .bib ──────────────────────────────────────────────────────────

	async function exportBib() {
		const bib = await trpc.references.exportBibtex.query(data.project.id);
		const blob = new Blob([bib], { type: 'text/plain;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${data.project.title.replace(/\s+/g, '_')}.bib`;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<div class="mx-auto flex max-w-6xl flex-col px-6 py-8" style="min-height: calc(100vh - 4rem)">
	<!-- Header -->
	<div class="mb-6">
		<a
			href={resolve(`/projects/${data.project.id}`)}
			class="mb-4 flex items-center gap-1.5 font-sans text-sm text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
		>
			<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
				<path
					d="M10 12L6 8l4-4"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
			{data.project.title}
		</a>

		<div class="flex items-center justify-between gap-4">
			<div>
				<h1
					data-tutorial="project-bib-title"
					class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink"
				>
					Bibliography
				</h1>
				<p class="mt-0.5 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
					{references.length}
					{references.length === 1 ? 'reference' : 'references'}
				</p>
			</div>
			<div class="flex items-center gap-2">
				{#if references.length > 0}
					<div
						class="flex overflow-hidden rounded-md border border-paper-border dark:border-dark-paper-border"
					>
						{#each Object.entries(CITATION_STYLE_LABELS) as [s, label] (s)}
							<button
								onclick={() => (citationStyle = s as CitationStyle)}
								class="px-3 py-1.5 font-sans text-xs transition-colors {citationStyle === s
									? 'bg-accent text-white'
									: 'text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui'}"
								>{label}</button
							>
						{/each}
					</div>
				{/if}
				<button
					onclick={() => (showSemanticSearch = true)}
					class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
					title="Search on Semantic Scholar"
				>
					Search paper
				</button>
				<button
					data-tutorial="project-bib-doi"
					onclick={() => (panel = 'doi')}
					class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
				>
					DOI lookup
				</button>
				<button
					data-tutorial="project-bib-url"
					onclick={() => (panel = 'url')}
					class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
				>
					URL → AI
				</button>
				<button
					data-tutorial="project-bib-import"
					onclick={() => (panel = 'import')}
					class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
				>
					Import .bib
				</button>

				<button
					onclick={() => (panel = 'link-library')}
					class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
				>
					Link from library
				</button>
				{#if references.length > 0}
					<button
						onclick={exportBib}
						class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
					>
						Export .bib
					</button>
				{/if}
				<button
					data-tutorial="project-bib-new"
					onclick={openNew}
					class="rounded-md bg-accent px-3 py-1.5 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover"
				>
					+ New reference
				</button>
			</div>
		</div>
	</div>

	<!-- Search -->
	{#if references.length > 0}
		<div class="mb-4">
			<input
				type="search"
				bind:value={searchQuery}
				placeholder="Search by author, title, year, journal…"
				class="w-full max-w-sm rounded-lg border border-paper-border bg-paper px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
			/>
		</div>
	{/if}

	<!-- Reference list -->
	<div class="flex flex-1 gap-6">
		<div class="min-w-0 flex-1">
			<BibReferenceList
				refs={filtered() as any}
				totalCount={references.length}
				{searchQuery}
				{citationStyle}
				projectId={data.project.id}
				{generatingPdfIds}
				onedit={(ref) => openEdit(ref as any)}
				ondelete={(ref) => (refToDelete = ref as any)}
				onaddnew={openNew}
				onimport={() => (panel = 'import')}
				onreferenceupdated={(id, updates) => {
					references = references.map((r) => (r.id === id ? { ...r, ...updates } : r));
				}}
			/>
		</div>

		<!-- ── Side panel ───────────────────────────────────────────────── -->
		{#if panel === 'new'}
			<ReferenceFormPanel
				mode="new"
				projectId={data.project.id}
				onclose={closePanel}
				onsave={(ref) => {
					references = [...references, ref as Ref].sort((a, b) =>
						a.citeKey.localeCompare(b.citeKey)
					);
				}}
			/>
		{:else if panel === 'edit'}
			<ReferenceFormPanel
				mode="edit"
				{editingRef}
				projectId={data.project.id}
				onclose={closePanel}
				onsave={(ref) => {
					references = references.map((r) => (r.id === (ref as Ref).id ? (ref as Ref) : r));
				}}
			/>
		{:else if panel === 'doi'}
			<DoiLookupPanel
				onclose={closePanel}
				onaccept={async (result) => {
					await trpc.references.create.mutate({
						projectId: data.project.id,
						reference: {
							citeKey: result.citeKey,
							type: result.type as never,
							title: result.title,
							authors: result.authors,
							editors: result.editors,
							year: result.year ?? '',
							journal: result.journal ?? '',
							volume: result.volume ?? '',
							issue: result.issue ?? '',
							pages: result.pages ?? '',
							publisher: result.publisher ?? '',
							abstract: result.abstract ?? '',
							doi: result.doi,
							url: result.url,
							note: '',
							isbn: '',
							booktitle: '',
							organization: '',
							series: '',
							school: '',
							institution: '',
							reportNumber: '',
							address: '',
							edition: '',
							extra: {}
						}
					});
					const fresh = await trpc.references.list.query(data.project.id);
					references = fresh as Ref[];
					panel = null;
				}}
			/>
		{:else if panel === 'url'}
			<UrlLookupPanel
				projectId={data.project.id}
				hasAiKey={data.hasAiKey}
				onclose={closePanel}
				onaccept={async (result, savePdf, importDocument) => {
					const sourceUrl = result.url;
					const newRef = await trpc.references.create.mutate({
						projectId: data.project.id,
						reference: {
							citeKey: result.citeKey,
							type: result.type as never,
							title: result.title,
							authors: result.authors,
							editors: [],
							year: result.year ?? '',
							abstract: result.abstract ?? '',
							journal: result.journal ?? '',
							volume: result.volume ?? '',
							issue: result.issue ?? '',
							pages: result.pages ?? '',
							publisher: result.publisher ?? '',
							booktitle: result.booktitle ?? '',
							school: result.school ?? '',
							institution: result.institution ?? '',
							url: sourceUrl,
							doi: '',
							note: '',
							isbn: '',
							organization: '',
							series: '',
							reportNumber: '',
							address: '',
							edition: '',
							extra: {}
						}
					});
					const fresh = await trpc.references.list.query(data.project.id);
					references = fresh as typeof references;
					panel = null;
					if (importDocument) {
						trpc.references.importDocumentFromUrl
							.mutate({
								url: sourceUrl,
								projectId: data.project.id,
								title: result.title,
								referenceId: newRef.id
							})
							.then(({ docId }) => goto(resolve(`/projects/${data.project.id}/documents/${docId}`)))
							.catch((e) =>
								flash.set(e instanceof Error ? e.message : 'Document import failed.', 'error')
							);
					}
					if (savePdf) {
						const refId = newRef.id;
						generatingPdfIds.add(refId);
						trpc.references.generatePdfFromUrl
							.mutate({ refId, projectId: data.project.id })
							.then((res) => {
								if (res?.pdfKey)
									references = references.map((r) =>
										r.id === refId
											? { ...r, pdfKey: res.pdfKey, pdfUrl: `/api/references/${refId}/pdf` }
											: r
									);
								else flash.set('PDF generation failed — you can upload one manually.', 'error');
							})
							.catch(() =>
								flash.set('PDF generation failed — you can upload one manually.', 'error')
							)
							.finally(() => {
								generatingPdfIds.delete(refId);
							});
					}
				}}
			/>
		{:else if panel === 'import'}
			<ImportBibPanel
				projectId={data.project.id}
				onclose={closePanel}
				onimported={async () => {
					const fresh = await trpc.references.list.query(data.project.id);
					references = fresh as Ref[];
				}}
			/>
		{:else if panel === 'link-library'}
			<LinkLibraryPanel
				projectId={data.project.id}
				linkedRefs={references}
				onclose={closePanel}
				onlinked={async () => {
					const fresh = await trpc.references.list.query(data.project.id);
					references = fresh as Ref[];
					panel = 'closed';
				}}
			/>
		{/if}
	</div>
</div>

{#if showSemanticSearch}
	<SemanticSearchModal
		projectId={data.project.id}
		onclose={() => (showSemanticSearch = false)}
		onadd={(ref) => {
			references = [ref as Ref, ...references];
		}}
	/>
{/if}

<TutorialManager
	slug="project-bib"
	completedTutorials={data.completedTutorials}
	steps={projectBibTutorialSteps}
/>

<SafeDeleteDialog
	open={!!refToDelete}
	label={refToDelete?.citeKey ?? ''}
	warning="The reference will be removed from this project. Documents citing it will keep the text but lose the formatted bibliography entry."
	deleting={deletingRef}
	requireCode={false}
	onconfirm={confirmDeleteRef}
	oncancel={() => (refToDelete = null)}
/>
