<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { trpc } from '$lib/utils/trpc';
	import {
		generateCiteKey,
		parseBibtexFile,
		formatBibtexFile,
		formatAuthorString
	} from '$lib/utils/bibtex';
	import type { Author, ReferenceType } from '$lib/utils/bibtex';
	import {
		formatFullCitation,
		CITATION_STYLE_LABELS,
		type CitationStyle,
		type CiteRef
	} from '$lib/utils/citations';
	import type { PageData } from './$types';

	// ── Citation style ────────────────────────────────────────────────────────

	let citationStyle = $state<CitationStyle>('apa');

	// Render markdown inline: *text* → <em>text</em>, **text** → <strong>text</strong>
	function renderInlineMarkdown(md: string): string {
		return md
			.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
			.replace(/\*(.+?)\*/g, '<em>$1</em>');
	}

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
				(r.authors as Author[]).some(
					(a) => a.last.toLowerCase().includes(q) || a.first.toLowerCase().includes(q)
				) ||
				r.journal?.toLowerCase().includes(q) ||
				r.booktitle?.toLowerCase().includes(q)
		);
	});

	// ── Reading notes ────────────────────────────────────────────────────────

	let expandedNotes = $state<string | null>(null); // ref.id with open notes
	let notesText = $state('');
	let notesSaving = $state(false);

	function toggleNotes(ref: Ref) {
		if (expandedNotes === ref.id) {
			expandedNotes = null;
		} else {
			expandedNotes = ref.id;
			notesText = (ref.readingNotes as string | null) ?? '';
		}
	}

	async function saveNotes(ref: Ref) {
		if (notesSaving) return;
		notesSaving = true;
		try {
			await trpc.references.updateReadingNotes.mutate({ id: ref.id, readingNotes: notesText });
			ref.readingNotes = notesText || null;
		} finally {
			notesSaving = false;
		}
	}

	// ── Side panel (create / edit) ───────────────────────────────────────────

	type Panel = 'closed' | 'new' | 'edit' | 'import';
	let panel = $state<Panel>('closed');
	let editingRef = $state<Ref | null>(null);

	// Form state
	let form = $state(emptyForm());
	let saving = $state(false);
	let saveError = $state('');

	function emptyForm() {
		return {
			citeKey: '',
			type: 'article' as ReferenceType,
			title: '',
			authors: [{ first: '', last: '' }] as Author[],
			year: '',
			abstract: '',
			doi: '',
			url: '',
			note: '',
			// article
			journal: '',
			volume: '',
			issue: '',
			pages: '',
			// book
			publisher: '',
			edition: '',
			address: '',
			isbn: '',
			editors: [] as Author[],
			// conference / collection
			booktitle: '',
			organization: '',
			series: '',
			// thesis
			school: '',
			// techreport
			institution: '',
			reportNumber: ''
		};
	}

	function openNew() {
		form = emptyForm();
		editingRef = null;
		saveError = '';
		panel = 'new';
	}

	function openEdit(ref: Ref) {
		editingRef = ref;
		saveError = '';
		form = {
			citeKey: ref.citeKey,
			type: ref.type as ReferenceType,
			title: ref.title,
			authors:
				(ref.authors as Author[]).length > 0 ? (ref.authors as Author[]) : [{ first: '', last: '' }],
			year: ref.year ?? '',
			abstract: ref.abstract ?? '',
			doi: ref.doi ?? '',
			url: ref.url ?? '',
			note: ref.note ?? '',
			journal: ref.journal ?? '',
			volume: ref.volume ?? '',
			issue: ref.issue ?? '',
			pages: ref.pages ?? '',
			publisher: ref.publisher ?? '',
			edition: ref.edition ?? '',
			address: ref.address ?? '',
			isbn: ref.isbn ?? '',
			editors:
				((ref.editors as Author[]) ?? []).length > 0 ? (ref.editors as Author[]) : [],
			booktitle: ref.booktitle ?? '',
			organization: ref.organization ?? '',
			series: ref.series ?? '',
			school: ref.school ?? '',
			institution: ref.institution ?? '',
			reportNumber: ref.reportNumber ?? ''
		};
		panel = 'edit';
	}

	function closePanel() {
		panel = 'closed';
		editingRef = null;
	}

	// Auto-generate cite key when author/year changes and key is still empty
	function autoCiteKey() {
		if (form.citeKey) return;
		const key = generateCiteKey(form.authors, form.year);
		if (key !== 'ref') form.citeKey = key;
	}

	// Author list helpers
	function addAuthor() {
		form.authors = [...form.authors, { first: '', last: '' }];
	}
	function removeAuthor(i: number) {
		form.authors = form.authors.filter((_, idx) => idx !== i);
	}
	function updateAuthor(i: number, field: 'first' | 'last', value: string) {
		form.authors = form.authors.map((a, idx) => (idx === i ? { ...a, [field]: value } : a));
	}

	async function saveReference() {
		saving = true;
		saveError = '';
		try {
			const payload = {
				citeKey: form.citeKey.trim() || generateCiteKey(form.authors, form.year),
				type: form.type,
				title: form.title.trim(),
				authors: form.authors.filter((a) => a.last.trim()),
				year: form.year.trim() || undefined,
				abstract: form.abstract.trim() || undefined,
				doi: form.doi.trim() || undefined,
				url: form.url.trim() || undefined,
				note: form.note.trim() || undefined,
				journal: form.journal.trim() || undefined,
				volume: form.volume.trim() || undefined,
				issue: form.issue.trim() || undefined,
				pages: form.pages.trim() || undefined,
				publisher: form.publisher.trim() || undefined,
				edition: form.edition.trim() || undefined,
				address: form.address.trim() || undefined,
				isbn: form.isbn.trim() || undefined,
				editors: form.editors.filter((a) => a.last.trim()),
				booktitle: form.booktitle.trim() || undefined,
				organization: form.organization.trim() || undefined,
				series: form.series.trim() || undefined,
				school: form.school.trim() || undefined,
				institution: form.institution.trim() || undefined,
				reportNumber: form.reportNumber.trim() || undefined,
				extra: {}
			};

			if (panel === 'edit' && editingRef) {
				const updated = await trpc.references.update.mutate({
					id: editingRef.id,
					projectId: data.project.id,
					reference: payload
				});
				references = references.map((r) => (r.id === updated.id ? (updated as Ref) : r));
			} else {
				const created = await trpc.references.create.mutate({
					projectId: data.project.id,
					reference: payload
				});
				references = [...references, created as Ref].sort((a, b) =>
					a.citeKey.localeCompare(b.citeKey)
				);
			}
			closePanel();
		} catch (e) {
			saveError = e instanceof Error ? e.message : 'Error al guardar';
		} finally {
			saving = false;
		}
	}

	async function deleteRef(ref: Ref) {
		if (!confirm(`¿Eliminar "${ref.citeKey}"?`)) return;
		try {
			await trpc.references.delete.mutate(ref.id);
			references = references.filter((r) => r.id !== ref.id);
		} catch {
			/* non-critical */
		}
	}

	// ── Import BibTeX ────────────────────────────────────────────────────────

	let importRaw = $state('');
	let importing = $state(false);
	let importResult = $state<{ inserted: number; skipped: number } | null>(null);
	let importError = $state('');

	// Preview how many entries would be imported
	const importPreview = $derived(() => {
		if (!importRaw.trim()) return 0;
		try {
			return parseBibtexFile(importRaw).length;
		} catch {
			return 0;
		}
	});

	async function runImport() {
		importing = true;
		importResult = null;
		importError = '';
		try {
			const result = await trpc.references.importBibtex.mutate({
				projectId: data.project.id,
				raw: importRaw
			});
			importResult = result;
			// Reload list
			const fresh = await trpc.references.list.query(data.project.id);
			references = fresh as Ref[];
		} catch (e) {
			importError = e instanceof Error ? e.message : 'Error al importar';
		} finally {
			importing = false;
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

	// ── Copy cite key ────────────────────────────────────────────────────────

	let copiedId = $state<string | null>(null);
	async function copyCiteKey(ref: Ref) {
		await navigator.clipboard.writeText(`[@${ref.citeKey}]`);
		copiedId = ref.id;
		setTimeout(() => (copiedId = null), 1500);
	}

	// ── Type labels & field config ───────────────────────────────────────────

	const TYPE_LABELS: Record<string, string> = {
		article: 'Artículo',
		book: 'Libro',
		inproceedings: 'Conferencia',
		incollection: 'Capítulo',
		phdthesis: 'Tesis PhD',
		mastersthesis: 'Tesis Máster',
		techreport: 'Informe técnico',
		misc: 'Otro'
	};

	// Which extra fields show for each type
	const TYPE_FIELDS: Record<string, string[]> = {
		article: ['journal', 'volume', 'issue', 'pages'],
		book: ['publisher', 'edition', 'address', 'isbn', 'editors'],
		inproceedings: ['booktitle', 'pages', 'organization', 'address'],
		incollection: ['booktitle', 'pages', 'publisher', 'editors'],
		phdthesis: ['school', 'address'],
		mastersthesis: ['school', 'address'],
		techreport: ['institution', 'reportNumber', 'address'],
		misc: ['url', 'note']
	};

	const ALL_TYPES: ReferenceType[] = [
		'article',
		'book',
		'inproceedings',
		'incollection',
		'phdthesis',
		'mastersthesis',
		'techreport',
		'misc'
	];

	function formatAuthors(ref: Ref): string {
		const authors = ref.authors as Author[];
		if (!authors.length) return '';
		if (authors.length === 1) return `${authors[0].last}${authors[0].first ? ', ' + authors[0].first : ''}`;
		if (authors.length === 2)
			return `${authors[0].last} & ${authors[1].last}`;
		return `${authors[0].last} et al.`;
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
				<path d="M10 12L6 8l4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
			{data.project.title}
		</a>

		<div class="flex items-center justify-between gap-4">
			<div>
				<h1 class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">Bibliografía</h1>
				<p class="mt-0.5 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
					{references.length} {references.length === 1 ? 'referencia' : 'referencias'}
				</p>
			</div>
			<div class="flex items-center gap-2">
				{#if references.length > 0}
					<div class="flex overflow-hidden rounded-md border border-paper-border dark:border-dark-paper-border">
						{#each Object.entries(CITATION_STYLE_LABELS) as [s, label] (s)}
							<button
								onclick={() => (citationStyle = s as CitationStyle)}
								class="px-3 py-1.5 font-sans text-xs transition-colors {citationStyle === s ? 'bg-accent text-white' : 'text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui'}"
							>{label}</button>
						{/each}
					</div>
				{/if}
				<button
					onclick={() => { panel = 'import'; importRaw = ''; importResult = null; importError = ''; }}
					class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
				>
					Importar .bib
				</button>
				{#if references.length > 0}
					<button
						onclick={exportBib}
						class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
					>
						Exportar .bib
					</button>
				{/if}
				<button
					onclick={openNew}
					class="rounded-md bg-accent px-3 py-1.5 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover"
				>
					+ Nueva referencia
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
				placeholder="Buscar por autor, título, año, revista…"
				class="w-full max-w-sm rounded-lg border border-paper-border bg-paper px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
			/>
		</div>
	{/if}

	<!-- Reference list -->
	<div class="flex flex-1 gap-6">
		<div class="flex-1 min-w-0">
			{#if references.length === 0}
				<div class="flex flex-col items-center justify-center rounded-2xl border border-dashed border-paper-border py-20 text-center dark:border-dark-paper-border">
					<p class="font-serif text-lg text-ink-muted dark:text-dark-ink-muted">Sin referencias</p>
					<p class="mt-1 font-sans text-sm text-ink-faint dark:text-dark-ink-faint">
						Añade referencias manualmente o importa un archivo .bib
					</p>
					<div class="mt-4 flex gap-3">
						<button onclick={openNew} class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white hover:bg-accent-hover">
							+ Nueva referencia
						</button>
						<button onclick={() => { panel = 'import'; }} class="rounded-md border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted">
							Importar .bib
						</button>
					</div>
				</div>
			{:else if filtered().length === 0}
				<p class="py-8 text-center font-sans text-sm text-ink-faint dark:text-dark-ink-faint">
					Sin resultados para "<span class="font-medium">{searchQuery}</span>"
				</p>
			{:else}
				<div class="flex flex-col gap-1">
					{#each filtered() as ref (ref.id)}
						<div class="group flex items-start gap-3 rounded-xl border border-paper-border bg-paper px-4 py-3 transition-colors hover:border-accent/30 dark:border-dark-paper-border dark:bg-dark-paper dark:hover:border-accent/20">
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
								<p class="mt-1.5 font-sans text-[11px] leading-snug text-ink-faint dark:text-dark-ink-faint">{@html renderInlineMarkdown(formatFullCitation(ref as unknown as CiteRef, citationStyle, filtered().indexOf(ref) + 1))}</p>
							</div>

							<!-- Type badge -->
							<span class="mt-0.5 shrink-0 rounded-full bg-paper-ui px-2 py-0.5 font-sans text-[10px] text-ink-faint dark:bg-dark-paper-ui dark:text-dark-ink-faint">
								{TYPE_LABELS[ref.type] ?? ref.type}
							</span>

							<!-- Actions -->
							<div class="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
								<button
									onclick={() => toggleNotes(ref)}
									class="relative rounded-md p-1.5 transition-colors {expandedNotes === ref.id ? 'text-accent' : 'text-ink-muted hover:bg-paper-ui hover:text-ink dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui dark:hover:text-dark-ink'}"
									title="Notas de lectura"
								>
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none">
										<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
										<polyline points="14 2 14 8 20 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
										<line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
										<line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
									</svg>
									{#if ref.readingNotes}
										<span class="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-accent"></span>
									{/if}
								</button>
								<button
									onclick={() => openEdit(ref)}
									class="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-paper-ui hover:text-ink dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui dark:hover:text-dark-ink"
									title="Editar"
								>
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none">
										<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
										<path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
									</svg>
								</button>
								<button
									onclick={() => deleteRef(ref)}
									class="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-red-50 hover:text-red-600 dark:text-dark-ink-muted dark:hover:bg-red-950/30 dark:hover:text-red-400"
									title="Eliminar"
								>
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none">
										<polyline points="3 6 5 6 21 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
										<path d="M19 6l-1 14H6L5 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
										<path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
									</svg>
								</button>
							</div>
						</div>

						<!-- Reading notes panel (expandable) -->
						{#if expandedNotes === ref.id}
							<div class="border-t border-paper-border px-4 pb-3 pt-2.5 dark:border-dark-paper-border">
								<label for="notes-{ref.id}" class="mb-1.5 block font-sans text-[11px] font-medium uppercase tracking-wide text-ink-faint dark:text-dark-ink-faint">
									Notas de lectura
								</label>
								<textarea
									id="notes-{ref.id}"
									bind:value={notesText}
									onblur={() => saveNotes(ref)}
									rows="5"
									placeholder="Apuntes, citas relevantes, conexiones con otros textos…"
									class="w-full resize-y rounded-lg border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink dark:placeholder:text-dark-ink-faint"
								></textarea>
								<div class="mt-1.5 flex items-center justify-between">
									<span class="font-sans text-[11px] text-ink-faint dark:text-dark-ink-faint">
										{notesSaving ? 'Guardando…' : 'Se guarda al salir del campo'}
									</span>
									<button
										onclick={() => saveNotes(ref)}
										disabled={notesSaving}
										class="rounded-md px-3 py-1 font-sans text-xs font-medium text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
									>
										Guardar
									</button>
								</div>
							</div>
						{/if}
					{/each}
				</div>
			{/if}
		</div>

		<!-- ── Side panel ───────────────────────────────────────────────── -->
		{#if panel === 'new' || panel === 'edit'}
			<div class="w-full max-w-sm shrink-0">
				<div class="sticky top-20 rounded-2xl border border-paper-border bg-paper dark:border-dark-paper-border dark:bg-dark-paper overflow-hidden">
					<!-- Panel header -->
					<div class="flex items-center justify-between border-b border-paper-border px-5 py-3.5 dark:border-dark-paper-border">
						<h2 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">
							{panel === 'edit' ? 'Editar referencia' : 'Nueva referencia'}
						</h2>
						<button onclick={closePanel} aria-label="Cerrar" class="rounded-md p-1 text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui">
							<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
								<path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
							</svg>
						</button>
					</div>

					<!-- Panel body -->
					<div class="max-h-[calc(100vh-10rem)] overflow-y-auto px-5 py-4 space-y-4">
						<!-- Type -->
						<div>
							<label for="ref-type" class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted">Tipo</label>
							<select id="ref-type" bind:value={form.type} class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink">
								{#each ALL_TYPES as t (t)}
									<option value={t}>{TYPE_LABELS[t]}</option>
								{/each}
							</select>
						</div>

						<!-- Title -->
						<div>
							<label for="ref-title" class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted">Título *</label>
							<input id="ref-title" type="text" bind:value={form.title} class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink" />
						</div>

						<!-- Authors -->
						<div>
							<div class="mb-1 flex items-center justify-between">
								<span class="font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted">Autores</span>
								<button onclick={addAuthor} class="font-sans text-xs text-accent hover:underline">+ Añadir</button>
							</div>
							<div class="space-y-1.5">
								{#each form.authors as author, i (i)}
									<div class="flex gap-1.5">
										<input
											type="text"
											placeholder="Apellido"
											value={author.last}
											oninput={(e) => updateAuthor(i, 'last', (e.target as HTMLInputElement).value)}
											onblur={autoCiteKey}
											class="min-w-0 flex-1 rounded-md border border-paper-border bg-paper-ui px-2 py-1.5 font-sans text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
										/>
										<input
											type="text"
											placeholder="Nombre"
											value={author.first}
											oninput={(e) => updateAuthor(i, 'first', (e.target as HTMLInputElement).value)}
											class="min-w-0 flex-1 rounded-md border border-paper-border bg-paper-ui px-2 py-1.5 font-sans text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
										/>
										{#if form.authors.length > 1}
											<button onclick={() => removeAuthor(i)} class="shrink-0 rounded-md px-1.5 text-ink-faint hover:text-red-500">×</button>
										{/if}
									</div>
								{/each}
							</div>
						</div>

						<!-- Year + Cite key -->
						<div class="grid grid-cols-2 gap-2">
							<div>
								<label for="ref-year" class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted">Año</label>
								<input id="ref-year" type="text" bind:value={form.year} maxlength={4} onblur={autoCiteKey} placeholder="2024" class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink" />
							</div>
							<div>
								<label for="ref-key" class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted">Clave (@cite)</label>
								<input id="ref-key" type="text" bind:value={form.citeKey} placeholder="smith2024" class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-mono text-xs text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink" />
							</div>
						</div>

						<!-- Type-specific fields -->
						{#if form.type === 'article'}
							<div>
								<label for="ref-journal" class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted">Revista</label>
								<input id="ref-journal" type="text" bind:value={form.journal} class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink" />
							</div>
							<div class="grid grid-cols-3 gap-2">
								<div>
									<label for="ref-vol" class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted">Vol.</label>
									<input id="ref-vol" type="text" bind:value={form.volume} class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink" />
								</div>
								<div>
									<label for="ref-issue" class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted">Núm.</label>
									<input id="ref-issue" type="text" bind:value={form.issue} class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink" />
								</div>
								<div>
									<label for="ref-pages" class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted">Págs.</label>
									<input id="ref-pages" type="text" bind:value={form.pages} placeholder="1--12" class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink" />
								</div>
							</div>
						{:else if form.type === 'book'}
							<div>
								<label for="ref-publisher" class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted">Editorial</label>
								<input id="ref-publisher" type="text" bind:value={form.publisher} class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink" />
							</div>
							<div class="grid grid-cols-2 gap-2">
								<div>
									<label for="ref-edition" class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted">Edición</label>
									<input id="ref-edition" type="text" bind:value={form.edition} class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink" />
								</div>
								<div>
									<label for="ref-isbn" class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted">ISBN</label>
									<input id="ref-isbn" type="text" bind:value={form.isbn} class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink" />
								</div>
							</div>
						{:else if form.type === 'inproceedings' || form.type === 'incollection'}
							<div>
								<label for="ref-booktitle" class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted">{form.type === 'incollection' ? 'Libro' : 'Conferencia / Proceedings'}</label>
								<input id="ref-booktitle" type="text" bind:value={form.booktitle} class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink" />
							</div>
							<div class="grid grid-cols-2 gap-2">
								<div>
									<label for="ref-pages2" class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted">Págs.</label>
									<input id="ref-pages2" type="text" bind:value={form.pages} placeholder="1--12" class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink" />
								</div>
								<div>
									<label for="ref-org" class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted">Organización</label>
									<input id="ref-org" type="text" bind:value={form.organization} class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink" />
								</div>
							</div>
						{:else if form.type === 'phdthesis' || form.type === 'mastersthesis'}
							<div>
								<label for="ref-school" class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted">Universidad / Institución</label>
								<input id="ref-school" type="text" bind:value={form.school} class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink" />
							</div>
						{:else if form.type === 'techreport'}
							<div>
								<label for="ref-inst" class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted">Institución</label>
								<input id="ref-inst" type="text" bind:value={form.institution} class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink" />
							</div>
							<div>
								<label for="ref-repnum" class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted">Número de informe</label>
								<input id="ref-repnum" type="text" bind:value={form.reportNumber} class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink" />
							</div>
						{/if}

						<!-- Common optional fields -->
						<div>
							<label for="ref-doi" class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted">DOI</label>
							<input id="ref-doi" type="text" bind:value={form.doi} placeholder="10.xxxx/xxxxx" class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink" />
						</div>
						<div>
							<label for="ref-url" class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted">URL</label>
							<input id="ref-url" type="text" bind:value={form.url} class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink" />
						</div>
						<div>
							<label for="ref-abstract" class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted">Resumen</label>
							<textarea id="ref-abstract" bind:value={form.abstract} rows={3} class="w-full resize-none rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"></textarea>
						</div>

						{#if saveError}
							<p class="rounded-lg bg-red-50 px-3 py-2 font-sans text-xs text-red-600 dark:bg-red-950/30 dark:text-red-400">{saveError}</p>
						{/if}
					</div>

					<!-- Panel footer -->
					<div class="flex justify-end gap-2 border-t border-paper-border px-5 py-3 dark:border-dark-paper-border">
						<button onclick={closePanel} disabled={saving} class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted hover:bg-paper-ui disabled:opacity-50 dark:border-dark-paper-border dark:text-dark-ink-muted">
							Cancelar
						</button>
						<button
							onclick={saveReference}
							disabled={saving || !form.title.trim()}
							class="rounded-md bg-accent px-3 py-1.5 font-sans text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
						>
							{saving ? 'Guardando…' : panel === 'edit' ? 'Guardar cambios' : 'Crear referencia'}
						</button>
					</div>
				</div>
			</div>

		<!-- ── Import panel ──────────────────────────────────────────────── -->
		{:else if panel === 'import'}
			<div class="w-full max-w-sm shrink-0">
				<div class="sticky top-20 rounded-2xl border border-paper-border bg-paper dark:border-dark-paper-border dark:bg-dark-paper overflow-hidden">
					<div class="flex items-center justify-between border-b border-paper-border px-5 py-3.5 dark:border-dark-paper-border">
						<h2 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">Importar BibTeX</h2>
						<button onclick={closePanel} aria-label="Cerrar" class="rounded-md p-1 text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui">
							<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
								<path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
							</svg>
						</button>
					</div>

					<div class="px-5 py-4 space-y-4">
						<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
							Pega el contenido de un archivo <code class="rounded bg-paper-ui px-1 font-mono text-xs dark:bg-dark-paper-ui">.bib</code> o varias entradas BibTeX.
						</p>

						<div>
							<label for="import-raw" class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted">
								Contenido BibTeX
								{#if importPreview() > 0}
									<span class="ml-1 text-accent">· {importPreview()} {importPreview() === 1 ? 'entrada' : 'entradas'} detectadas</span>
								{/if}
							</label>
							<textarea
								id="import-raw"
								bind:value={importRaw}
								rows={12}
								placeholder={"@article{smith2024,\n  title = {Example},\n  author = {Smith, John},\n  year = {2024},\n  journal = {Nature}\n}"}
								class="w-full resize-y rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-mono text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
							></textarea>
						</div>

						{#if importResult}
							<div class="rounded-lg border border-green-200 bg-green-50 px-3 py-2 dark:border-green-800/40 dark:bg-green-950/30">
								<p class="font-sans text-sm text-green-700 dark:text-green-400">
									✓ {importResult.inserted} {importResult.inserted === 1 ? 'referencia importada' : 'referencias importadas'}
									{#if importResult.skipped > 0}
										· {importResult.skipped} omitidas
									{/if}
								</p>
							</div>
						{/if}

						{#if importError}
							<p class="rounded-lg bg-red-50 px-3 py-2 font-sans text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">{importError}</p>
						{/if}
					</div>

					<div class="flex justify-end gap-2 border-t border-paper-border px-5 py-3 dark:border-dark-paper-border">
						<button onclick={closePanel} class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted">
							Cerrar
						</button>
						<button
							onclick={runImport}
							disabled={importing || importPreview() === 0}
							class="rounded-md bg-accent px-3 py-1.5 font-sans text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
						>
							{importing ? 'Importando…' : `Importar ${importPreview() > 0 ? importPreview() : ''}`}
						</button>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>
