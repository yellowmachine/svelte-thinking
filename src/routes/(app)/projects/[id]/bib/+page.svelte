<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { trpc } from '$lib/utils/trpc';
	import { formatBibtexFile } from '$lib/utils/bibtex';
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
	import { onlineStore } from '$lib/stores/online.svelte';
	import { pouchStore } from '$lib/offline/pouch.svelte';
	import { onMount, onDestroy } from 'svelte';

	// ── Citation style ────────────────────────────────────────────────────────

	let citationStyle = $state<CitationStyle>('apa');

	let { data }: { data: PageData } = $props();

	// ── State ────────────────────────────────────────────────────────────────

	type Ref = (typeof data.references)[number];

	let references = $state<Ref[]>(data.references);
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

	// ── Reading notes ────────────────────────────────────────────────────────

	let openingNotes = $state<string | null>(null); // ref.id currently loading

	async function openReadingNotes(ref: Ref) {
		openingNotes = ref.id;
		try {
			const { docId } = await trpc.references.openReadingNotes.mutate({ refId: ref.id, projectId: data.project.id });
			await goto(`/projects/${data.project.id}/documents/${docId}`);
		} finally {
			openingNotes = null;
		}
	}

	// ── Subnotes ─────────────────────────────────────────────────────────────

	type Subnote = { id: number | string; referenceId: string; slug: string; notes: string; _pending?: boolean };

	let expandedSubnotes = new SvelteSet<string>();
	let subnotesByRef = $state<Record<string, Subnote[]>>({});
	let loadingSubnotes = new SvelteSet<string>();

	let addingSubnoteRef = $state<string | null>(null);
	let newSubnoteSlug = $state('');
	let newSubnoteNotes = $state('');
	let savingSubnote = $state(false);
	let deletingSubnoteId = $state<number | string | null>(null);

	let editingSubnote = $state<{ refId: string; id: number } | null>(null);
	let editSubnoteNotes = $state('');
	let savingSubnoteEdit = $state(false);

	async function toggleSubnotes(refId: string) {
		if (expandedSubnotes.has(refId)) {
			expandedSubnotes.delete(refId);
			return;
		}
		expandedSubnotes.add(refId);
		if (!(refId in subnotesByRef)) {
			loadingSubnotes.add(refId);
			try {
				if (!onlineStore.online) {
					// Read from PouchDB cache
					const cached = await pouchStore.getReferences(data.project.id);
					const ref = cached?.references?.find((r: { id: string }) => r.id === refId);
					subnotesByRef[refId] = (ref?.subnotes ?? []).map((s: { id: number; slug: string; notes: string }) => ({
						...s,
						referenceId: refId
					}));
				} else {
					const rows = await trpc.references.listSubnotes.query({ referenceId: refId });
					subnotesByRef[refId] = rows as Subnote[];
				}
			} finally {
				loadingSubnotes.delete(refId);
			}
		}
	}

	function openAddSubnote(refId: string) {
		addingSubnoteRef = refId;
		newSubnoteSlug = '';
		newSubnoteNotes = '';
	}

	async function saveSubnote(refId: string) {
		if (!newSubnoteSlug.trim()) return;
		savingSubnote = true;
		try {
			const slug = newSubnoteSlug.trim();
			const notes = newSubnoteNotes;
			if (!onlineStore.online) {
				await pouchStore.mergeProjectOps(data.project.id, { upsert: [{ referenceId: refId, slug, notes }] });
				subnotesByRef[refId] = [...(subnotesByRef[refId] ?? []), {
					id: slug,
					referenceId: refId,
					slug,
					notes,
					_pending: true
				} as Subnote];
			} else {
				const row = await trpc.references.addSubnote.mutate({ referenceId: refId, slug, notes });
				subnotesByRef[refId] = [...(subnotesByRef[refId] ?? []), row as Subnote];
			}
			addingSubnoteRef = null;
		} catch (e) {
			flash.set(e instanceof Error ? e.message : 'Error saving subnote', 'error');
		} finally {
			savingSubnote = false;
		}
	}

	async function deleteSubnote(refId: string, id: number | string, slug: string) {
		if (typeof id === 'string') {
			// Pending-only subnote: remove from ops and local state
			await pouchStore.mergeProjectOps(data.project.id, { delete: [{ referenceId: refId, slug }] });
			subnotesByRef[refId] = (subnotesByRef[refId] ?? []).filter((s) => s.id !== id);
			return;
		}
		deletingSubnoteId = id;
		try {
			await trpc.references.deleteSubnote.mutate({ id });
			subnotesByRef[refId] = (subnotesByRef[refId] ?? []).filter((s) => s.id !== id);
		} finally {
			deletingSubnoteId = null;
		}
	}

	async function updateSubnote(refId: string, id: number, slug: string) {
		const notes = editSubnoteNotes;
		savingSubnoteEdit = true;
		try {
			if (!onlineStore.online) {
				await pouchStore.mergeProjectOps(data.project.id, { upsert: [{ referenceId: refId, slug, notes }] });
			} else {
				await trpc.references.updateSubnote.mutate({ id, notes });
			}
			subnotesByRef[refId] = (subnotesByRef[refId] ?? []).map((s) =>
				s.id === id ? { ...s, notes } : s
			);
			editingSubnote = null;
		} catch (e) {
			flash.set(e instanceof Error ? e.message : 'Error saving subnote', 'error');
		} finally {
			savingSubnoteEdit = false;
		}
	}

	// ── PDF attachment ───────────────────────────────────────────────────────

	let uploadingPdfId = $state<string | null>(null);
	let deletingPdfId = $state<string | null>(null);
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
			href="/projects/{data.project.id}"
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
				<h1 class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">Bibliography</h1>
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
					onclick={() => (panel = 'doi')}
					class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
				>
					DOI lookup
				</button>
				<button
					onclick={() => (panel = 'url')}
					class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
				>
					URL → AI
				</button>
				<button
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
			{#if references.length === 0}
				<div
					class="flex flex-col items-center justify-center rounded-2xl border border-dashed border-paper-border py-20 text-center dark:border-dark-paper-border"
				>
					<p class="font-serif text-lg text-ink-muted dark:text-dark-ink-muted">No references yet</p>
					<p class="mt-1 font-sans text-sm text-ink-faint dark:text-dark-ink-faint">
						Add references manually or import a .bib file
					</p>
					<div class="mt-4 flex gap-3">
						<button
							onclick={openNew}
							class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white hover:bg-accent-hover"
						>
							+ New reference
						</button>
						<button
							onclick={() => {
								panel = 'import';
							}}
							class="rounded-md border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted"
						>
							Import .bib
						</button>
					</div>
				</div>
			{:else if filtered().length === 0}
				<p class="py-8 text-center font-sans text-sm text-ink-faint dark:text-dark-ink-faint">
					No results for "<span class="font-medium">{searchQuery}</span>"
				</p>
			{:else}
				<div class="flex flex-col gap-1">
					{#each filtered() as ref (ref.id)}
						<div
							class="group flex items-start gap-3 rounded-xl border border-paper-border bg-paper px-4 py-3 transition-colors hover:border-accent/30 dark:border-dark-paper-border dark:bg-dark-paper dark:hover:border-accent/20"
						>
							<!-- Cite key badge -->
							<button
								onclick={() => copyCiteKey(ref)}
								title="Copiar como [@{ref.citeKey}]"
								class="mt-0.5 shrink-0 rounded-md border border-accent/30 bg-accent/5 px-2 py-0.5 font-mono text-xs font-medium text-accent transition-colors hover:bg-accent/10"
							>
								{copiedId === ref.id ? '✓' : ref.citeKey}
							</button>

							<!-- Content -->
							<div class="min-w-0 flex-1">
								<p class="truncate font-sans text-sm font-medium text-ink dark:text-dark-ink">
									{ref.title}
								</p>
								<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
									{formatAuthors(ref)}{ref.year ? ' · ' + ref.year : ''}
									{#if ref.journal}
										· <em>{ref.journal}</em>
									{:else if ref.booktitle}
										· {ref.booktitle}
									{:else if ref.school}
										· {ref.school}
									{/if}
								</p>
								{#if ref.doi}
									<a
										href="https://doi.org/{ref.doi}"
										target="_blank"
										rel="noopener noreferrer"
										class="mt-0.5 block truncate font-sans text-xs text-accent hover:underline"
									>
										doi:{ref.doi}
									</a>
								{/if}
								<!-- eslint-disable-next-line svelte/no-at-html-tags -->
								<p
									class="mt-1.5 font-sans text-[11px] leading-snug text-ink-faint dark:text-dark-ink-faint"
								>
									{@html renderInlineMarkdown(
										formatFullCitation(
											ref as unknown as CiteRef,
											citationStyle,
											filtered().indexOf(ref) + 1
										)
									)}
								</p>

								<!-- Subnotes -->
								<div class="mt-2">
									<button
										onclick={() => toggleSubnotes(ref.id)}
										class="flex items-center gap-1.5 font-sans text-[11px] text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
									>
										<svg
											width="10"
											height="10"
											viewBox="0 0 24 24"
											fill="none"
											class="transition-transform {expandedSubnotes.has(ref.id) ? 'rotate-90' : ''}"
										>
											<polyline points="9 18 15 12 9 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
										</svg>
										<span>Subnotes</span>
										{#if (subnotesByRef[ref.id]?.length ?? 0) > 0}
											<span class="rounded-full bg-accent/10 px-1.5 py-px text-[10px] font-semibold text-accent">
												{subnotesByRef[ref.id].length}
											</span>
										{/if}
										{#if loadingSubnotes.has(ref.id)}
											<Spinner size="sm" />
										{/if}
									</button>

									{#if expandedSubnotes.has(ref.id)}
										<div class="mt-1.5 border-l-2 border-paper-border pl-3 dark:border-dark-paper-border">
											{#if subnotesByRef[ref.id]?.length > 0}
												<ul class="flex flex-col gap-1">
													{#each subnotesByRef[ref.id] as sn (sn.id)}
														<li class="flex flex-col gap-1 {sn._pending ? 'opacity-60' : ''}">
															<div class="flex items-start gap-2">
																<span class="mt-px shrink-0 rounded bg-paper-ui px-1.5 py-px font-mono text-[10px] text-ink-muted dark:bg-dark-paper-ui dark:text-dark-ink-muted">
																	{sn.slug}{sn._pending ? ' ⏳' : ''}
																</span>
																{#if editingSubnote?.id === sn.id}
																	<span class="flex-1"></span>
																{:else if sn.notes}
																	<span class="flex-1 font-sans text-[11px] leading-snug text-ink dark:text-dark-ink">{sn.notes}</span>
																{:else}
																	<span class="flex-1 font-sans text-[11px] italic text-ink-faint dark:text-dark-ink-faint">no notes</span>
																{/if}
																{#if !sn._pending && typeof sn.id === 'number'}
																	<button
																		onclick={() => {
																			if (editingSubnote?.id === sn.id) {
																				editingSubnote = null;
																			} else {
																				editingSubnote = { refId: ref.id, id: sn.id as number };
																				editSubnoteNotes = sn.notes;
																			}
																		}}
																		title={editingSubnote?.id === sn.id ? 'Cancel' : 'Edit notes'}
																		class="mt-px shrink-0 rounded p-0.5 text-ink-faint transition-colors hover:text-accent dark:text-dark-ink-faint dark:hover:text-accent"
																	>
																		<svg width="10" height="10" viewBox="0 0 24 24" fill="none">
																			<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
																		</svg>
																	</button>
																{/if}
																<button
																	onclick={() => deleteSubnote(ref.id, sn.id, sn.slug)}
																	disabled={deletingSubnoteId === sn.id}
																	title="Delete subnote"
																	class="mt-px shrink-0 rounded p-0.5 text-ink-faint transition-colors hover:text-red-500 disabled:opacity-40 dark:text-dark-ink-faint dark:hover:text-red-400"
																>
																	{#if deletingSubnoteId === sn.id}
																		<Spinner size="sm" />
																	{:else}
																		<svg width="10" height="10" viewBox="0 0 24 24" fill="none">
																			<line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
																			<line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
																		</svg>
																	{/if}
																</button>
															</div>
															{#if editingSubnote?.id === sn.id}
																<div class="flex flex-col gap-1">
																	<textarea
																		bind:value={editSubnoteNotes}
																		rows="2"
																		class="w-full rounded border border-paper-border bg-paper px-2 py-1 font-sans text-[11px] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink dark:focus:border-accent"
																	></textarea>
																	<div class="flex gap-1.5">
																		<button
																			onclick={() => updateSubnote(ref.id, sn.id as number, sn.slug)}
																			disabled={savingSubnoteEdit}
																			class="rounded bg-accent px-2.5 py-1 font-sans text-[11px] font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
																		>
																			{#if savingSubnoteEdit}<Spinner size="sm" />{:else}Save{/if}
																		</button>
																		<button
																			onclick={() => (editingSubnote = null)}
																			class="rounded border border-paper-border px-2.5 py-1 font-sans text-[11px] text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
																		>
																			Cancel
																		</button>
																	</div>
																</div>
															{/if}
														</li>
													{/each}
												</ul>
											{:else if !loadingSubnotes.has(ref.id)}
												<p class="font-sans text-[11px] italic text-ink-faint dark:text-dark-ink-faint">No subnotes yet.</p>
											{/if}

											{#if addingSubnoteRef === ref.id}
												<div class="mt-2 flex flex-col gap-1.5">
													<div class="flex gap-1.5">
														<input
															type="text"
															placeholder="slug (e.g. p103, ch2)"
															bind:value={newSubnoteSlug}
															class="w-28 rounded border border-paper-border bg-paper px-2 py-1 font-mono text-[11px] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink dark:placeholder:text-dark-ink-faint dark:focus:border-accent"
														/>
														<input
															type="text"
															placeholder="notes (optional)"
															bind:value={newSubnoteNotes}
															class="min-w-0 flex-1 rounded border border-paper-border bg-paper px-2 py-1 font-sans text-[11px] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink dark:placeholder:text-dark-ink-faint dark:focus:border-accent"
														/>
													</div>
													<div class="flex gap-1.5">
														<button
															onclick={() => saveSubnote(ref.id)}
															disabled={savingSubnote || !newSubnoteSlug.trim()}
															class="rounded bg-accent px-2.5 py-1 font-sans text-[11px] font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
														>
															{#if savingSubnote}<Spinner size="sm" />{:else}Save{/if}
														</button>
														<button
															onclick={() => (addingSubnoteRef = null)}
															class="rounded px-2.5 py-1 font-sans text-[11px] text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
														>
															Cancel
														</button>
													</div>
												</div>
											{:else}
												<button
													onclick={() => openAddSubnote(ref.id)}
													class="mt-1.5 flex items-center gap-1 font-sans text-[11px] text-ink-faint transition-colors hover:text-accent dark:text-dark-ink-faint dark:hover:text-accent"
												>
													<svg width="10" height="10" viewBox="0 0 24 24" fill="none">
														<line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
														<line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
													</svg>
													Add subnote
												</button>
											{/if}
										</div>
									{/if}
								</div>
							</div>

							<!-- Type badge -->
							<span
								class="mt-0.5 shrink-0 rounded-full bg-paper-ui px-2 py-0.5 font-sans text-[10px] text-ink-faint dark:bg-dark-paper-ui dark:text-dark-ink-faint"
							>
								{TYPE_LABELS[ref.type] ?? ref.type}
							</span>

							<!-- Actions -->
							<div
								class="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100"
							>
								<button
									onclick={() => openReadingNotes(ref)}
									disabled={openingNotes === ref.id}
									class="relative rounded-md p-1.5 transition-colors {ref.readingNotesDocId
										? 'text-accent'
										: 'text-ink-muted hover:bg-paper-ui hover:text-ink dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui dark:hover:text-dark-ink'} disabled:opacity-50"
									title="Reading notes"
								>
									{#if openingNotes === ref.id}
										<Spinner size="sm" />
									{:else}
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none">
											<path
												d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
												stroke="currentColor"
												stroke-width="1.5"
												stroke-linecap="round"
											/>
											<polyline
												points="14 2 14 8 20 8"
												stroke="currentColor"
												stroke-width="1.5"
												stroke-linecap="round"
											/>
											<line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
											<line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
										</svg>
										{#if ref.readingNotesDocId}
											<span class="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-accent"></span>
										{/if}
									{/if}
								</button>
								<!-- PDF badge (always visible) -->
								{#if generatingPdfIds.has(ref.id)}
									<span
										title="Generating PDF…"
										class="flex items-center gap-1 rounded border border-paper-border bg-paper-ui px-1.5 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wide text-ink-faint dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink-faint"
									>
										<Spinner size="sm" />
										PDF
									</span>
								{:else if ref.pdfKey}
									<div class="flex items-center gap-0.5">
										<a
											href="/api/references/{ref.id}/pdf"
											target="_blank"
											rel="noopener noreferrer"
											title="Open PDF"
											class="rounded-l rounded-r-none border border-r-0 border-green-300 bg-green-50 px-1.5 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wide text-green-700 transition-colors hover:bg-green-100 dark:border-green-700/50 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/30"
										>
											PDF
										</a>
										<button
											onclick={() => deletePdf(ref)}
											disabled={deletingPdfId === ref.id}
											title="Remove PDF"
											class="rounded-l-none rounded-r border border-green-300 bg-green-50 px-1 py-0.5 text-green-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-40 dark:border-green-700/50 dark:bg-green-900/20 dark:text-green-500 dark:hover:border-red-700/50 dark:hover:bg-red-900/20 dark:hover:text-red-400"
										>
											<svg width="9" height="9" viewBox="0 0 24 24" fill="none">
												<line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
												<line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
											</svg>
										</button>
									</div>
								{:else}
									<label
										title={uploadingPdfId === ref.id ? 'Uploading…' : 'Attach PDF'}
										class="flex cursor-pointer items-center gap-1 rounded border border-paper-border bg-paper-ui px-1.5 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wide text-ink-faint transition-colors hover:border-ink-muted hover:text-ink-muted dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink-faint dark:hover:border-dark-ink-muted dark:hover:text-dark-ink-muted {uploadingPdfId === ref.id ? 'pointer-events-none opacity-60' : ''}"
									>
										<input
											type="file"
											accept=".pdf"
											class="hidden"
											onchange={(e) => {
												const f = (e.target as HTMLInputElement).files?.[0];
												if (f) uploadPdf(ref, f);
												(e.target as HTMLInputElement).value = '';
											}}
										/>
										{#if uploadingPdfId === ref.id}
											<Spinner size="sm" />
										{/if}
										PDF
									</label>
								{/if}

								<button
									onclick={() => openEdit(ref)}
									class="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-paper-ui hover:text-ink dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui dark:hover:text-dark-ink"
									title="Edit"
								>
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none">
										<path
											d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"
											stroke="currentColor"
											stroke-width="1.5"
											stroke-linecap="round"
										/>
										<path
											d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
											stroke="currentColor"
											stroke-width="1.5"
											stroke-linecap="round"
										/>
									</svg>
								</button>
								<button
									onclick={() => (refToDelete = ref)}
									class="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-red-50 hover:text-red-600 dark:text-dark-ink-muted dark:hover:bg-red-950/30 dark:hover:text-red-400"
									title="Delete"
								>
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none">
										<polyline
											points="3 6 5 6 21 6"
											stroke="currentColor"
											stroke-width="1.5"
											stroke-linecap="round"
										/>
										<path
											d="M19 6l-1 14H6L5 6"
											stroke="currentColor"
											stroke-width="1.5"
											stroke-linecap="round"
										/>
										<path
											d="M10 11v6M14 11v6"
											stroke="currentColor"
											stroke-width="1.5"
											stroke-linecap="round"
										/>
									</svg>
								</button>
							</div>
						</div>

					{/each}
				</div>
			{/if}
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
				editingRef={editingRef}
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
							note: '', isbn: '', booktitle: '', organization: '',
							series: '', school: '', institution: '',
							reportNumber: '', address: '', edition: '', extra: {}
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
							citeKey: result.citeKey, type: result.type as never,
							title: result.title, authors: result.authors, editors: [],
							year: result.year ?? '', abstract: result.abstract ?? '',
							journal: result.journal ?? '', volume: result.volume ?? '',
							issue: result.issue ?? '', pages: result.pages ?? '',
							publisher: result.publisher ?? '', booktitle: result.booktitle ?? '',
							school: result.school ?? '', institution: result.institution ?? '',
							url: sourceUrl, doi: '', note: '', isbn: '',
							organization: '', series: '', reportNumber: '', address: '', edition: '', extra: {}
						}
					});
					const fresh = await trpc.references.list.query(data.project.id);
					references = fresh as typeof references;
					panel = null;
					if (importDocument) {
						trpc.references.importDocumentFromUrl
							.mutate({ url: sourceUrl, projectId: data.project.id, title: result.title, referenceId: newRef.id })
							.then(({ docId }) => goto(`/projects/${data.project.id}/documents/${docId}`))
							.catch((e) => flash.set(e instanceof Error ? e.message : 'Document import failed.', 'error'));
					}
					if (savePdf) {
						const refId = newRef.id;
						generatingPdfIds.add(refId);
						trpc.references.generatePdfFromUrl
							.mutate({ refId, projectId: data.project.id })
							.then((res) => {
								if (res?.pdfKey) references = references.map((r) => r.id === refId ? { ...r, pdfKey: res.pdfKey, pdfUrl: `/api/references/${refId}/pdf` } : r);
								else flash.set('PDF generation failed — you can upload one manually.', 'error');
							})
							.catch(() => flash.set('PDF generation failed — you can upload one manually.', 'error'))
							.finally(() => { generatingPdfIds.delete(refId); });
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

<SafeDeleteDialog
	open={!!refToDelete}
	label={refToDelete?.citeKey ?? ''}
	warning="The reference will be removed from this project. Documents citing it will keep the text but lose the formatted bibliography entry."
	deleting={deletingRef}
	requireCode={false}
	onconfirm={confirmDeleteRef}
	oncancel={() => (refToDelete = null)}
/>
