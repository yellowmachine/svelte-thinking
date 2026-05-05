<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { trpc } from '$lib/utils/trpc';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { formatFullCitation, type CitationStyle, type CiteRef } from '$lib/utils/citations';
	import { TYPE_LABELS, type Author } from '$lib/utils/bibtex';
	import { flash } from '$lib/stores/flash.svelte';

	type BibRef = {
		id: string;
		citeKey: string;
		title: string;
		year?: string | null;
		authors: Author[];
		journal?: string | null;
		booktitle?: string | null;
		school?: string | null;
		doi?: string | null;
		pdfKey?: string | null;
		pdfUrl?: string | null;
		readingNotesDocId?: string | null;
		type: string;
	};

	let {
		refs,
		totalCount,
		searchQuery,
		citationStyle,
		projectId,
		generatingPdfIds,
		onedit,
		ondelete,
		onaddnew,
		onimport,
		onreferenceupdated
	}: {
		refs: BibRef[];
		totalCount: number;
		searchQuery: string;
		citationStyle: CitationStyle;
		projectId: string;
		generatingPdfIds: SvelteSet<string>;
		onedit: (ref: BibRef) => void;
		ondelete: (ref: BibRef) => void;
		onaddnew: () => void;
		onimport: () => void;
		onreferenceupdated: (
			id: string,
			updates: { pdfKey?: string | null; pdfUrl?: string | null }
		) => void;
	} = $props();

	let copiedId = $state<string | null>(null);
	async function copyCiteKey(ref: BibRef) {
		await navigator.clipboard.writeText(`[@${ref.citeKey}]`);
		copiedId = ref.id;
		setTimeout(() => (copiedId = null), 1500);
	}

	let openingNotes = $state<string | null>(null);
	async function openReadingNotes(ref: BibRef) {
		openingNotes = ref.id;
		try {
			const { docId } = await trpc.references.openReadingNotes.mutate({
				refId: ref.id,
				projectId
			});
			await goto(`/projects/${projectId}/documents/${docId}`);
		} finally {
			openingNotes = null;
		}
	}

	type Subnote = { id: number; referenceId: string; slug: string; notes: string };
	let expandedSubnotes = new SvelteSet<string>();
	let subnotesByRef = $state<Record<string, Subnote[]>>({});
	let loadingSubnotes = new SvelteSet<string>();
	let addingSubnoteRef = $state<string | null>(null);
	let newSubnoteSlug = $state('');
	let newSubnoteNotes = $state('');
	let savingSubnote = $state(false);
	let deletingSubnoteId = $state<number | null>(null);

	async function toggleSubnotes(refId: string) {
		if (expandedSubnotes.has(refId)) {
			expandedSubnotes.delete(refId);
			return;
		}
		expandedSubnotes.add(refId);
		if (!(refId in subnotesByRef)) {
			loadingSubnotes.add(refId);
			try {
				const rows = await trpc.references.listSubnotes.query({ referenceId: refId });
				subnotesByRef[refId] = rows as Subnote[];
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
			const row = await trpc.references.addSubnote.mutate({
				referenceId: refId,
				slug: newSubnoteSlug.trim(),
				notes: newSubnoteNotes
			});
			subnotesByRef[refId] = [...(subnotesByRef[refId] ?? []), row as Subnote];
			addingSubnoteRef = null;
		} catch (e) {
			flash.set(e instanceof Error ? e.message : 'Error saving annotation', 'error');
		} finally {
			savingSubnote = false;
		}
	}

	async function deleteSubnote(refId: string, id: number) {
		deletingSubnoteId = id;
		try {
			await trpc.references.deleteSubnote.mutate({ id });
			subnotesByRef[refId] = (subnotesByRef[refId] ?? []).filter((s) => s.id !== id);
		} finally {
			deletingSubnoteId = null;
		}
	}

	let uploadingPdfId = $state<string | null>(null);
	let deletingPdfId = $state<string | null>(null);

	async function uploadPdf(ref: BibRef, file: File) {
		uploadingPdfId = ref.id;
		try {
			const form = new FormData();
			form.append('file', file);
			const res = await fetch(`/api/projects/${projectId}/references/${ref.id}/pdf`, {
				method: 'POST',
				body: form
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				alert(body.message ?? 'Error uploading PDF');
				return;
			}
			onreferenceupdated(ref.id, { pdfKey: 'set', pdfUrl: `/api/references/${ref.id}/pdf` });
		} finally {
			uploadingPdfId = null;
		}
	}

	async function deletePdf(ref: BibRef) {
		deletingPdfId = ref.id;
		try {
			await fetch(`/api/projects/${projectId}/references/${ref.id}/pdf`, { method: 'DELETE' });
			onreferenceupdated(ref.id, { pdfKey: null, pdfUrl: null });
		} finally {
			deletingPdfId = null;
		}
	}

	function formatAuthors(ref: BibRef): string {
		const authors = ref.authors;
		if (!authors.length) return '';
		if (authors.length === 1)
			return `${authors[0].last}${authors[0].first ? ', ' + authors[0].first : ''}`;
		if (authors.length === 2) return `${authors[0].last} & ${authors[1].last}`;
		return `${authors[0].last} et al.`;
	}

	function renderInlineMarkdown(md: string): string {
		return md.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
	}
</script>

{#if totalCount === 0}
	<div
		class="flex flex-col items-center justify-center rounded-2xl border border-dashed border-paper-border py-20 text-center dark:border-dark-paper-border"
	>
		<p class="font-serif text-lg text-ink-muted dark:text-dark-ink-muted">No references yet</p>
		<p class="mt-1 font-sans text-sm text-ink-faint dark:text-dark-ink-faint">
			Add references manually or import a .bib file
		</p>
		<div class="mt-4 flex gap-3">
			<button
				onclick={onaddnew}
				class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white hover:bg-accent-hover"
			>
				+ New reference
			</button>
			<button
				onclick={onimport}
				class="rounded-md border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted"
			>
				Import .bib
			</button>
		</div>
	</div>
{:else if refs.length === 0}
	<p class="py-8 text-center font-sans text-sm text-ink-faint dark:text-dark-ink-faint">
		No results for "<span class="font-medium">{searchQuery}</span>"
	</p>
{:else}
	<div class="flex flex-col gap-1">
		{#each refs as ref, i (ref.id)}
			<div
				class="group flex items-start gap-3 rounded-xl border border-paper-border bg-paper px-4 py-3 transition-colors hover:border-accent/30 dark:border-dark-paper-border dark:bg-dark-paper dark:hover:border-accent/20"
			>
				<!-- Cite key badge -->
				<button
					onclick={() => copyCiteKey(ref)}
					translate="no"
					title="Copiar como [@{ref.citeKey}]"
					class="mt-0.5 shrink-0 rounded-md border border-accent/30 bg-accent/5 px-2 py-0.5 font-mono text-xs font-medium text-accent transition-colors hover:bg-accent/10"
				>
					{copiedId === ref.id ? '✓' : ref.citeKey}
				</button>

				<!-- Content -->
				<div class="min-w-0 flex-1">
					<p
						translate="no"
						class="truncate font-sans text-sm font-medium text-ink dark:text-dark-ink"
					>
						{ref.title}
					</p>
					<p
						translate="no"
						class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted"
					>
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
						translate="no"
						class="mt-1.5 font-sans text-[11px] leading-snug text-ink-faint dark:text-dark-ink-faint"
					>
						{@html renderInlineMarkdown(
							formatFullCitation(ref as unknown as CiteRef, citationStyle, i + 1)
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
								<polyline
									points="9 18 15 12 9 6"
									stroke="currentColor"
									stroke-width="2.5"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
							<span>Subnotes</span>
							{#if (subnotesByRef[ref.id]?.length ?? 0) > 0}
								<span
									class="rounded-full bg-accent/10 px-1.5 py-px text-[10px] font-semibold text-accent"
								>
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
											<li class="flex items-start gap-2">
												<span
													translate="no"
													class="mt-px shrink-0 rounded bg-paper-ui px-1.5 py-px font-mono text-[10px] text-ink-muted dark:bg-dark-paper-ui dark:text-dark-ink-muted"
												>
													{sn.slug}
												</span>
												{#if sn.notes}
													<span
														translate="no"
														class="flex-1 font-sans text-[11px] leading-snug text-ink dark:text-dark-ink"
														>{sn.notes}</span
													>
												{:else}
													<span
														class="flex-1 font-sans text-[11px] text-ink-faint italic dark:text-dark-ink-faint"
														>no notes</span
													>
												{/if}
												<button
													onclick={() => deleteSubnote(ref.id, sn.id)}
													disabled={deletingSubnoteId === sn.id}
													title="Delete annotation"
													class="mt-px shrink-0 rounded p-0.5 text-ink-faint transition-colors hover:text-red-500 disabled:opacity-40 dark:text-dark-ink-faint dark:hover:text-red-400"
												>
													{#if deletingSubnoteId === sn.id}
														<Spinner size="sm" />
													{:else}
														<svg width="10" height="10" viewBox="0 0 24 24" fill="none">
															<line
																x1="18"
																y1="6"
																x2="6"
																y2="18"
																stroke="currentColor"
																stroke-width="2.5"
																stroke-linecap="round"
															/>
															<line
																x1="6"
																y1="6"
																x2="18"
																y2="18"
																stroke="currentColor"
																stroke-width="2.5"
																stroke-linecap="round"
															/>
														</svg>
													{/if}
												</button>
											</li>
										{/each}
									</ul>
								{:else if !loadingSubnotes.has(ref.id)}
									<p class="font-sans text-[11px] text-ink-faint italic dark:text-dark-ink-faint">
										No subnotes yet.
									</p>
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
											<line
												x1="12"
												y1="5"
												x2="12"
												y2="19"
												stroke="currentColor"
												stroke-width="2.5"
												stroke-linecap="round"
											/>
											<line
												x1="5"
												y1="12"
												x2="19"
												y2="12"
												stroke="currentColor"
												stroke-width="2.5"
												stroke-linecap="round"
											/>
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
								<line
									x1="16"
									y1="13"
									x2="8"
									y2="13"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linecap="round"
								/>
								<line
									x1="16"
									y1="17"
									x2="8"
									y2="17"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linecap="round"
								/>
							</svg>
							{#if ref.readingNotesDocId}
								<span class="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-accent"
								></span>
							{/if}
						{/if}
					</button>

					<!-- PDF badge -->
					{#if generatingPdfIds.has(ref.id)}
						<span
							title="Generating PDF…"
							class="flex items-center gap-1 rounded border border-paper-border bg-paper-ui px-1.5 py-0.5 font-sans text-[10px] font-semibold tracking-wide text-ink-faint uppercase dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink-faint"
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
								class="rounded-l rounded-r-none border border-r-0 border-green-300 bg-green-50 px-1.5 py-0.5 font-sans text-[10px] font-semibold tracking-wide text-green-700 uppercase transition-colors hover:bg-green-100 dark:border-green-700/50 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/30"
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
									<line
										x1="18"
										y1="6"
										x2="6"
										y2="18"
										stroke="currentColor"
										stroke-width="2.5"
										stroke-linecap="round"
									/>
									<line
										x1="6"
										y1="6"
										x2="18"
										y2="18"
										stroke="currentColor"
										stroke-width="2.5"
										stroke-linecap="round"
									/>
								</svg>
							</button>
						</div>
					{:else}
						<label
							title={uploadingPdfId === ref.id ? 'Uploading…' : 'Attach PDF'}
							class="flex cursor-pointer items-center gap-1 rounded border border-paper-border bg-paper-ui px-1.5 py-0.5 font-sans text-[10px] font-semibold tracking-wide text-ink-faint uppercase transition-colors hover:border-ink-muted hover:text-ink-muted dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink-faint dark:hover:border-dark-ink-muted dark:hover:text-dark-ink-muted {uploadingPdfId ===
							ref.id
								? 'pointer-events-none opacity-60'
								: ''}"
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
						onclick={() => onedit(ref)}
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
						onclick={() => ondelete(ref)}
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
