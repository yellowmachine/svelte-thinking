<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { trpc } from '$lib/utils/trpc';
	import Spinner from '$lib/components/ui/Spinner.svelte';
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
	import SafeDeleteDialog from '$lib/components/ui/SafeDeleteDialog.svelte';
	import { goto } from '$app/navigation';
	import { flash } from '$lib/stores/flash.svelte';

	// ── Citation style ────────────────────────────────────────────────────────

	let citationStyle = $state<CitationStyle>('apa');

	// Render markdown inline: *text* → <em>text</em>, **text** → <strong>text</strong>
	function renderInlineMarkdown(md: string): string {
		return md.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
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
			flash.set(e instanceof Error ? e.message : 'Error saving subnote', 'error');
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

	// ── PDF attachment ───────────────────────────────────────────────────────

	let uploadingPdfId = $state<string | null>(null);
	let deletingPdfId = $state<string | null>(null);
	let generatingPdfIds = new SvelteSet<string>();

	async function uploadPdf(ref: Ref, file: File) {
		uploadingPdfId = ref.id;
		try {
			const form = new FormData();
			form.append('file', file);
			const res = await fetch(`/api/projects/${data.project.id}/references/${ref.id}/pdf`, {
				method: 'POST',
				body: form
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				alert(body.message ?? 'Error uploading PDF');
				return;
			}
			references = references.map((r) =>
				r.id === ref.id ? { ...r, pdfKey: 'set', pdfUrl: `/api/references/${ref.id}/pdf` } : r
			);
		} finally {
			uploadingPdfId = null;
		}
	}

	async function deletePdf(ref: Ref) {
		deletingPdfId = ref.id;
		try {
			await fetch(`/api/projects/${data.project.id}/references/${ref.id}/pdf`, { method: 'DELETE' });
			references = references.map((r) =>
				r.id === ref.id ? { ...r, pdfKey: null, pdfUrl: null } : r
			);
		} finally {
			deletingPdfId = null;
		}
	}

	// ── Semantic Scholar search ───────────────────────────────────────────────

	type SemanticResult = {
		paperId: string;
		title: string;
		year: number | null;
		venue: string;
		authors: { name: string }[];
		externalIds: { DOI?: string } | null;
		openAccessPdf: { url: string } | null;
	};

	let showSemanticSearch = $state(false);
	let semanticQuery = $state('');
	let semanticResults = $state<SemanticResult[]>([]);
	let semanticLoading = $state(false);
	let semanticError = $state('');
	let semanticAdding = $state<Set<string>>(new SvelteSet());

	async function searchSemantic() {
		const q = semanticQuery.trim();
		if (!q) return;
		semanticLoading = true;
		semanticError = '';
		semanticResults = [];
		try {
			const params = new URLSearchParams({
				query: q,
				fields: 'title,year,venue,authors,externalIds,openAccessPdf',
				limit: '8'
			});
			const res = await fetch(`https://api.semanticscholar.org/graph/v1/paper/search?${params}`);
			if (!res.ok) throw new Error(`Error ${res.status}`);
			const json = await res.json();
			semanticResults = json.data ?? [];
		} catch {
			semanticError = 'Error connecting to Semantic Scholar. Please try again.';
		} finally {
			semanticLoading = false;
		}
	}

	function parseSemanticAuthors(authors: { name: string }[]) {
		return authors.map((a) => {
			const parts = a.name.trim().split(/\s+/);
			const last = parts.pop() ?? '';
			const first = parts.join(' ');
			return { first, last };
		});
	}

	async function addSemanticResult(result: SemanticResult) {
		semanticAdding.add(result.paperId);
		try {
			const authors = parseSemanticAuthors(result.authors);
			const year = result.year ? String(result.year) : '';
			const citeKey = generateCiteKey(authors, year);
			const added = await trpc.references.create.mutate({
				projectId: data.project.id,
				reference: {
					citeKey,
					type: 'article',
					title: result.title,
					authors,
					year: year || undefined,
					journal: result.venue || undefined,
					doi: result.externalIds?.DOI || undefined,
					url: result.openAccessPdf?.url || undefined,
					extra: {}
				}
			});
			references = [added as Ref, ...references];
		} finally {
			semanticAdding.delete(result.paperId);
		}
	}

	// ── Side panel (create / edit) ───────────────────────────────────────────

	type Panel = 'closed' | 'new' | 'edit' | 'import' | 'link-library' | 'doi' | 'url' | null;
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
			reportNumber: '',
			// Theological sources (stored in extra)
			extra: {} as Record<string, string>
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
				(ref.authors as Author[]).length > 0
					? (ref.authors as Author[])
					: [{ first: '', last: '' }],
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
			editors: ((ref.editors as Author[]) ?? []).length > 0 ? (ref.editors as Author[]) : [],
			booktitle: ref.booktitle ?? '',
			organization: ref.organization ?? '',
			series: ref.series ?? '',
			school: ref.school ?? '',
			institution: ref.institution ?? '',
			reportNumber: ref.reportNumber ?? '',
			extra: (ref.extra ?? {}) as Record<string, string>
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
				extra: Object.fromEntries(Object.entries(form.extra).filter(([, v]) => v && v.trim()))
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
			saveError = e instanceof Error ? e.message : 'Failed to save';
		} finally {
			saving = false;
		}
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

	// ── Import BibTeX ────────────────────────────────────────────────────────

	let importRaw = $state('');
	let importing = $state(false);
	let importResult = $state<{ inserted: number; skipped: number } | null>(null);
	let importError = $state('');

	// ── Link from library ────────────────────────────────────────────────────

	type LibraryRef = { id: string; citeKey: string; type: string; title: string; authors: unknown; year: string | null; projectIds: string[] };

	let llRefs = $state<LibraryRef[]>([]);
	let llSelectedIds = $state<Set<string>>(new Set());
	let llSearch = $state('');
	let llFilterProjectId = $state('');
	let llProjects = $state<{ id: string; title: string }[]>([]);
	let llLoading = $state(false);
	let llLinking = $state(false);
	let llError = $state('');
	let llShowLinked = $state(false);

	const llFiltered = $derived(() => {
		const q = llSearch.toLowerCase().trim();
		return llRefs.filter((r) => {
			if (llFilterProjectId && !r.projectIds.includes(llFilterProjectId)) return false;
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

	async function openLinkLibrary() {
		panel = 'link-library';
		llSelectedIds = new Set();
		llSearch = '';
		llFilterProjectId = '';
		llError = '';
		llShowLinked = false;
		llLoading = true;
		try {
			type RawRef = { id: string; projectId: string | null; citeKey: string; type: string; title: string; authors: unknown; year: string | null };
			const [allRaw, allProjects] = await Promise.all([
				trpc.references.listAll.query(),
				trpc.projects.list.query()
			]);
			const all = allRaw as unknown as RawRef[];
			llProjects = (allProjects as { id: string; title: string }[]).filter(p => p.id !== data.project.id);
			const projectRefIds = new Set(references.map((r) => r.id));
			// Build refId → projectIds map (listAll returns one row per project link)
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
		if (llSelectedIds.size === llFiltered().length) {
			llSelectedIds = new Set();
		} else {
			llSelectedIds = new Set(llFiltered().map((r) => r.id));
		}
	}

	async function runLinkLibrary() {
		if (llSelectedIds.size === 0) return;
		llLinking = true;
		llError = '';
		try {
			await Promise.all(
				[...llSelectedIds].map((referenceId) =>
					trpc.references.attachToProject.mutate({ referenceId, projectId: data.project.id })
				)
			);
			const fresh = await trpc.references.list.query(data.project.id);
			references = fresh as Ref[];
			panel = 'closed';
		} catch (e) {
			llError = e instanceof Error ? e.message : 'Failed to link references.';
		} finally {
			llLinking = false;
		}
	}


	// ── DOI lookup ──────────────────────────────────────────────────────────
	type DoiResult = {
		citeKey: string;
		type: string;
		title: string;
		authors: { first: string; last: string }[];
		year: string | null;
		journal: string | null;
		doi: string;
		abstract: string | null;
		url: string;
		volume: string | null;
		issue: string | null;
		pages: string | null;
		publisher: string | null;
		editors: { first: string; last: string }[];
	};
	let doiInput = $state('');
	let doiLoading = $state(false);
	let doiResult = $state<DoiResult | null>(null);
	let doiError = $state('');

	async function runDoiLookup() {
		if (!doiInput.trim()) return;
		doiLoading = true;
		doiResult = null;
		doiError = '';
		try {
			doiResult = (await trpc.references.fetchDoi.query(doiInput.trim())) as DoiResult;
		} catch (e) {
			doiError = e instanceof Error ? e.message : 'DOI not found.';
		} finally {
			doiLoading = false;
		}
	}

	async function acceptDoiResult() {
		if (!doiResult) return;
		try {
			await trpc.references.create.mutate({
				projectId: data.project.id,
				reference: {
					citeKey: doiResult.citeKey,
					type: doiResult.type as never,
					title: doiResult.title,
					authors: doiResult.authors,
					editors: doiResult.editors,
					year: doiResult.year ?? '',
					journal: doiResult.journal ?? '',
					volume: doiResult.volume ?? '',
					issue: doiResult.issue ?? '',
					pages: doiResult.pages ?? '',
					publisher: doiResult.publisher ?? '',
					abstract: doiResult.abstract ?? '',
					doi: doiResult.doi,
					url: doiResult.url,
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
			references = fresh as typeof references;
			doiInput = '';
			doiResult = null;
			panel = null;
		} catch (e) {
			doiError = e instanceof Error ? e.message : 'Could not save reference.';
		}
	}

	// ── URL lookup ──────────────────────────────────────────────────────────
	type UrlResult = {
		citeKey: string;
		type: string;
		title: string;
		authors: { first: string; last: string }[];
		year: string | null;
		abstract: string | null;
		journal: string | null;
		volume: string | null;
		issue: string | null;
		pages: string | null;
		publisher: string | null;
		booktitle: string | null;
		school: string | null;
		institution: string | null;
		url: string;
	};
	let urlInput = $state('');
	let urlLoading = $state(false);
	let urlResult = $state<UrlResult | null>(null);
	let urlError = $state('');
	let urlSavePdf = $state(false);

	async function runUrlLookup() {
		if (!urlInput.trim()) return;
		urlLoading = true;
		urlResult = null;
		urlError = '';
		try {
			urlResult = (await trpc.references.fetchUrl.query({
				url: urlInput.trim(),
				projectId: data.project.id
			})) as UrlResult;
		} catch (e) {
			urlError = e instanceof Error ? e.message : 'Could not extract metadata from URL.';
		} finally {
			urlLoading = false;
		}
	}

	async function acceptUrlResult() {
		if (!urlResult) return;
		const sourceUrl = urlResult.url;
		try {
			const newRef = await trpc.references.create.mutate({
				projectId: data.project.id,
				reference: {
					citeKey: urlResult.citeKey,
					type: urlResult.type as never,
					title: urlResult.title,
					authors: urlResult.authors,
					editors: [],
					year: urlResult.year ?? '',
					abstract: urlResult.abstract ?? '',
					journal: urlResult.journal ?? '',
					volume: urlResult.volume ?? '',
					issue: urlResult.issue ?? '',
					pages: urlResult.pages ?? '',
					publisher: urlResult.publisher ?? '',
					booktitle: urlResult.booktitle ?? '',
					school: urlResult.school ?? '',
					institution: urlResult.institution ?? '',
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
			const shouldGeneratePdf = urlSavePdf;
			urlInput = '';
			urlResult = null;
			urlSavePdf = false;
			panel = null;
			if (!shouldGeneratePdf) return;
			// Best-effort: generate PDF in background — show spinner, flash on failure
			const refId = newRef.id;
			generatingPdfIds.add(refId);
			trpc.references.generatePdfFromUrl.mutate({ refId, projectId: data.project.id })
				.then((res) => {
					if (res?.pdfKey) {
						references = references.map((r) =>
							r.id === refId ? { ...r, pdfKey: res.pdfKey, pdfUrl: `/api/references/${refId}/pdf` } : r
						);
					} else {
						flash.set('PDF generation failed — you can upload one manually.', 'error');
					}
				})
				.catch(() => {
					flash.set('PDF generation failed — you can upload one manually.', 'error');
				})
				.finally(() => {
					generatingPdfIds.delete(refId);
				});
		} catch (e) {
			urlError = e instanceof Error ? e.message : 'Could not save reference.';
		}
	}

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
			importError = e instanceof Error ? e.message : 'Failed to import';
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
		article: 'Article',
		book: 'Book',
		inproceedings: 'Conference paper',
		incollection: 'Book chapter',
		phdthesis: 'PhD thesis',
		mastersthesis: "Master's thesis",
		techreport: 'Technical report',
		misc: 'Other',
		magisterial: 'Church document',
		patristic: 'Patristic / medieval text',
		scholastic: 'Scholastic work',
		biblical: 'Biblical text',
		classical: 'Classical text',
		earlymodern: 'Early modern work',
		film: 'Film / TV',
		interview: 'Interview',
		newspaper: 'Newspaper article'
	};

	const ALL_TYPES: ReferenceType[] = [
		'article',
		'book',
		'inproceedings',
		'incollection',
		'phdthesis',
		'mastersthesis',
		'techreport',
		'misc',
		'magisterial',
		'patristic',
		'scholastic',
		'biblical',
		'classical',
		'earlymodern',
		'film',
		'interview',
		'newspaper'
	];

	function formatAuthors(ref: Ref): string {
		const authors = ref.authors as Author[];
		if (!authors.length) return '';
		if (authors.length === 1)
			return `${authors[0].last}${authors[0].first ? ', ' + authors[0].first : ''}`;
		if (authors.length === 2) return `${authors[0].last} & ${authors[1].last}`;
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
					onclick={() => {
						showSemanticSearch = true;
						semanticQuery = '';
						semanticResults = [];
						semanticError = '';
					}}
					class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
					title="Search on Semantic Scholar"
				>
					Search paper
				</button>
				<button
					onclick={() => {
						panel = 'doi';
						doiInput = '';
						doiResult = null;
						doiError = '';
					}}
					class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
				>
					DOI lookup
				</button>
				<button
					onclick={() => {
						panel = 'url';
						urlInput = '';
						urlResult = null;
						urlError = '';
						urlSavePdf = false;
					}}
					class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
				>
					URL → AI
				</button>
				<button
					onclick={() => {
						panel = 'import';
						importRaw = '';
						importResult = null;
						importError = '';
					}}
					class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
				>
					Import .bib
				</button>

				<button
					onclick={openLinkLibrary}
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
														<li class="flex items-start gap-2">
															<span class="mt-px shrink-0 rounded bg-paper-ui px-1.5 py-px font-mono text-[10px] text-ink-muted dark:bg-dark-paper-ui dark:text-dark-ink-muted">
																{sn.slug}
															</span>
															{#if sn.notes}
																<span class="flex-1 font-sans text-[11px] leading-snug text-ink dark:text-dark-ink">{sn.notes}</span>
															{:else}
																<span class="flex-1 font-sans text-[11px] italic text-ink-faint dark:text-dark-ink-faint">no notes</span>
															{/if}
															<button
																onclick={() => deleteSubnote(ref.id, sn.id)}
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
		{#if panel === 'new' || panel === 'edit'}
			<div class="w-full max-w-sm shrink-0">
				<div
					class="sticky top-20 overflow-hidden rounded-2xl border border-paper-border bg-paper dark:border-dark-paper-border dark:bg-dark-paper"
				>
					<!-- Panel header -->
					<div
						class="flex items-center justify-between border-b border-paper-border px-5 py-3.5 dark:border-dark-paper-border"
					>
						<h2 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">
							{panel === 'edit' ? 'Edit reference' : 'New reference'}
						</h2>
						<button
							onclick={closePanel}
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

					<!-- Panel body -->
					<div class="max-h-[calc(100vh-10rem)] space-y-4 overflow-y-auto px-5 py-4">
						<!-- Type -->
						<div>
							<label
								for="ref-type"
								class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
								>Tipo</label
							>
							<select
								id="ref-type"
								bind:value={form.type}
								class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
							>
								{#each ALL_TYPES as t (t)}
									<option value={t}>{TYPE_LABELS[t]}</option>
								{/each}
							</select>
						</div>

						<!-- Title -->
						<div>
							<label
								for="ref-title"
								class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
								>Title *</label
							>
							<input
								id="ref-title"
								type="text"
								bind:value={form.title}
								class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
							/>
						</div>

						<!-- Authors (hidden for CCC — no personal author) -->
						{#if !(form.type === 'magisterial' && form.extra.doctype === 'catechism')}
							<div>
								<div class="mb-1 flex items-center justify-between">
									<span
										class="font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
										>Autores</span
									>
									<button onclick={addAuthor} class="font-sans text-xs text-accent hover:underline"
										>+ Add</button
									>
								</div>
								<div class="space-y-1.5">
									{#each form.authors as author, i (i)}
										<div class="flex gap-1.5">
											<input
												type="text"
												placeholder="Apellido"
												value={author.last}
												oninput={(e) =>
													updateAuthor(i, 'last', (e.target as HTMLInputElement).value)}
												onblur={autoCiteKey}
												class="min-w-0 flex-1 rounded-md border border-paper-border bg-paper-ui px-2 py-1.5 font-sans text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
											/>
											<input
												type="text"
												placeholder="Nombre"
												value={author.first}
												oninput={(e) =>
													updateAuthor(i, 'first', (e.target as HTMLInputElement).value)}
												class="min-w-0 flex-1 rounded-md border border-paper-border bg-paper-ui px-2 py-1.5 font-sans text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
											/>
											{#if form.authors.length > 1}
												<button
													onclick={() => removeAuthor(i)}
													class="shrink-0 rounded-md px-1.5 text-ink-faint hover:text-red-500"
													>×</button
												>
											{/if}
										</div>
									{/each}
								</div>
							</div>
						{/if}

						<!-- Year + Cite key -->
						<div class="grid grid-cols-2 gap-2">
							<div>
								<label
									for="ref-year"
									class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
									>Year</label
								>
								<input
									id="ref-year"
									type="text"
									bind:value={form.year}
									maxlength={4}
									onblur={autoCiteKey}
									placeholder="2024"
									class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
								/>
							</div>
							<div>
								<label
									for="ref-key"
									class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
									>Clave (@cite)</label
								>
								<input
									id="ref-key"
									type="text"
									bind:value={form.citeKey}
									placeholder="smith2024"
									class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-mono text-xs text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
								/>
							</div>
						</div>

						<!-- Type-specific fields -->
						{#if form.type === 'article'}
							<div>
								<label
									for="ref-journal"
									class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
									>Revista</label
								>
								<input
									id="ref-journal"
									type="text"
									bind:value={form.journal}
									class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
								/>
							</div>
							<div class="grid grid-cols-3 gap-2">
								<div>
									<label
										for="ref-vol"
										class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
										>Vol.</label
									>
									<input
										id="ref-vol"
										type="text"
										bind:value={form.volume}
										class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
									/>
								</div>
								<div>
									<label
										for="ref-issue"
										class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
										>No.</label
									>
									<input
										id="ref-issue"
										type="text"
										bind:value={form.issue}
										class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
									/>
								</div>
								<div>
									<label
										for="ref-pages"
										class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
										>Pages</label
									>
									<input
										id="ref-pages"
										type="text"
										bind:value={form.pages}
										placeholder="1--12"
										class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
									/>
								</div>
							</div>
						{:else if form.type === 'book'}
							<div>
								<label
									for="ref-publisher"
									class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
									>Editorial</label
								>
								<input
									id="ref-publisher"
									type="text"
									bind:value={form.publisher}
									class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
								/>
							</div>
							<div class="grid grid-cols-2 gap-2">
								<div>
									<label
										for="ref-edition"
										class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
										>Edition</label
									>
									<input
										id="ref-edition"
										type="text"
										bind:value={form.edition}
										class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
									/>
								</div>
								<div>
									<label
										for="ref-isbn"
										class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
										>ISBN</label
									>
									<input
										id="ref-isbn"
										type="text"
										bind:value={form.isbn}
										class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
									/>
								</div>
							</div>
						{:else if form.type === 'inproceedings' || form.type === 'incollection'}
							<div>
								<label
									for="ref-booktitle"
									class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
									>{form.type === 'incollection' ? 'Libro' : 'Conferencia / Proceedings'}</label
								>
								<input
									id="ref-booktitle"
									type="text"
									bind:value={form.booktitle}
									class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
								/>
							</div>
							<div class="grid grid-cols-2 gap-2">
								<div>
									<label
										for="ref-pages2"
										class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
										>Pages</label
									>
									<input
										id="ref-pages2"
										type="text"
										bind:value={form.pages}
										placeholder="1--12"
										class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
									/>
								</div>
								<div>
									<label
										for="ref-org"
										class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
										>Organization</label
									>
									<input
										id="ref-org"
										type="text"
										bind:value={form.organization}
										class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
									/>
								</div>
							</div>
						{:else if form.type === 'phdthesis' || form.type === 'mastersthesis'}
							<div>
								<label
									for="ref-school"
									class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
									>University / Institution</label
								>
								<input
									id="ref-school"
									type="text"
									bind:value={form.school}
									class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
								/>
							</div>
						{:else if form.type === 'techreport'}
							<div>
								<label
									for="ref-inst"
									class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
									>Institution</label
								>
								<input
									id="ref-inst"
									type="text"
									bind:value={form.institution}
									class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
								/>
							</div>
							<div>
								<label
									for="ref-repnum"
									class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
									>Report number</label
								>
								<input
									id="ref-repnum"
									type="text"
									bind:value={form.reportNumber}
									class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
								/>
							</div>
						{:else if form.type === 'magisterial'}
							<!-- Document type selector — comes first so the rest of the form adapts -->
							<div>
								<label
									for="ref-doctype"
									class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
									>Document type</label
								>
								<select
									id="ref-doctype"
									bind:value={form.extra.doctype}
									class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
								>
									<option value="">— select —</option>
									<option value="encyclical">Encyclical</option>
									<option value="apostolic_exhortation">Apostolic Exhortation</option>
									<option value="apostolic_constitution">Apostolic Constitution</option>
									<option value="conciliar_constitution">Conciliar Constitution</option>
									<option value="conciliar_decree">Conciliar Decree</option>
									<option value="conciliar_declaration">Conciliar Declaration</option>
									<option value="catechism">Catechism (CCC)</option>
									<option value="canon_law">Code of Canon Law</option>
									<option value="other">Other</option>
								</select>
							</div>

							{#if form.extra.doctype === 'catechism'}
								<!-- CCC: fixed document, no personal author, cite by paragraph -->
								<p
									class="rounded-md bg-paper-ui px-3 py-2 font-sans text-xs text-ink-muted dark:bg-dark-paper-ui dark:text-dark-ink-muted"
								>
									Use <strong>Catechism of the Catholic Church</strong> as the title. No author needed.
								</p>
								<div>
									<label
										for="ref-paragraph"
										class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
										>Paragraph §</label
									>
									<input
										id="ref-paragraph"
										type="text"
										placeholder="1234"
										bind:value={form.extra.paragraph}
										class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
									/>
								</div>
							{:else if form.extra.doctype === 'canon_law'}
								<!-- Canon Law: CIC 1983 or CCEO, canon number -->
								<div class="grid grid-cols-2 gap-2">
									<div>
										<label
											for="ref-canon-code"
											class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
											>Code</label
										>
										<select
											id="ref-canon-code"
											bind:value={form.extra.canon_code}
											class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
										>
											<option value="CIC1983">CIC 1983</option>
											<option value="CCEO">CCEO</option>
										</select>
									</div>
									<div>
										<label
											for="ref-canon"
											class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
											>Canon c.</label
										>
										<input
											id="ref-canon"
											type="text"
											placeholder="1024"
											bind:value={form.extra.paragraph}
											class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-mono text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
										/>
									</div>
								</div>
							{:else if form.extra.doctype === 'conciliar_constitution' || form.extra.doctype === 'conciliar_decree' || form.extra.doctype === 'conciliar_declaration'}
								<!-- Conciliar: Latin title + siglum + paragraph -->
								<div class="grid grid-cols-2 gap-2">
									<div>
										<label
											for="ref-latin-title"
											class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
											>Latin title</label
										>
										<input
											id="ref-latin-title"
											type="text"
											placeholder="Gaudium et Spes"
											bind:value={form.extra.latin_title}
											class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-serif text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
										/>
									</div>
									<div>
										<label
											for="ref-siglum"
											class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
											>Siglum</label
										>
										<input
											id="ref-siglum"
											type="text"
											placeholder="GS"
											bind:value={form.extra.siglum}
											class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-mono text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
										/>
									</div>
								</div>
								<div>
									<label
										for="ref-paragraph"
										class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
										>Paragraph §</label
									>
									<input
										id="ref-paragraph"
										type="text"
										placeholder="45"
										bind:value={form.extra.paragraph}
										class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
									/>
								</div>
							{:else}
								<!-- Papal (encyclical, exhortation, etc.) and generic -->
								{#if form.extra.doctype === 'encyclical' || form.extra.doctype === 'apostolic_exhortation' || form.extra.doctype === 'apostolic_constitution'}
									<div>
										<label
											for="ref-pope"
											class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
											>Pope</label
										>
										<input
											id="ref-pope"
											type="text"
											placeholder="Francis, John Paul II…"
											bind:value={form.extra.pope}
											class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
										/>
									</div>
								{/if}
								<div class="grid grid-cols-2 gap-2">
									<div>
										<label
											for="ref-siglum"
											class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
											>Siglum</label
										>
										<input
											id="ref-siglum"
											type="text"
											placeholder="EG, LS, GS…"
											bind:value={form.extra.siglum}
											class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-mono text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
										/>
									</div>
									<div>
										<label
											for="ref-paragraph"
											class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
											>Paragraph §</label
										>
										<input
											id="ref-paragraph"
											type="text"
											placeholder="45"
											bind:value={form.extra.paragraph}
											class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
										/>
									</div>
								</div>
							{/if}
						{:else if form.type === 'patristic'}
							<div>
								<label
									for="ref-section"
									class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
									>Section (book.chapter.§)</label
								>
								<input
									id="ref-section"
									type="text"
									placeholder="10.8.15"
									bind:value={form.extra.section}
									class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-mono text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
								/>
							</div>
							<div class="grid grid-cols-2 gap-2">
								<div>
									<label
										for="ref-edition"
										class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
										>Critical edition</label
									>
									<select
										id="ref-edition"
										bind:value={form.extra.edition}
										class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
									>
										<option value="">— none —</option>
										<option value="PG">PG (Patrologia Graeca)</option>
										<option value="PL">PL (Patrologia Latina)</option>
										<option value="SC">SC (Sources Chrétiennes)</option>
										<option value="CCL">CCL (Corpus Christianorum)</option>
										<option value="CSEL">CSEL</option>
										<option value="GCS">GCS</option>
									</select>
								</div>
								<div>
									<label
										for="ref-column"
										class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
										>Vol:col / page</label
									>
									<input
										id="ref-column"
										type="text"
										placeholder="32:456"
										bind:value={form.extra.column}
										class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-mono text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
									/>
								</div>
							</div>
						{:else if form.type === 'scholastic'}
							<p
								class="rounded-md bg-paper-ui px-3 py-2 font-sans text-xs text-ink-muted dark:bg-dark-paper-ui dark:text-dark-ink-muted"
							>
								Use <strong>Title</strong> for the work name (e.g. <em>Summa Theologiae</em>) and
								fill Author as usual.
							</p>
							<div class="grid grid-cols-3 gap-2">
								<div>
									<label
										for="ref-part"
										class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
										>Part</label
									>
									<input
										id="ref-part"
										type="text"
										placeholder="I-II"
										bind:value={form.extra.part}
										class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-mono text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
									/>
								</div>
								<div>
									<label
										for="ref-question"
										class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
										>Question (q.)</label
									>
									<input
										id="ref-question"
										type="text"
										placeholder="94"
										bind:value={form.extra.question}
										class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-mono text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
									/>
								</div>
								<div>
									<label
										for="ref-article"
										class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
										>Article (a.)</label
									>
									<input
										id="ref-article"
										type="text"
										placeholder="2"
										bind:value={form.extra.article}
										class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-mono text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
									/>
								</div>
							</div>
							<div>
								<label
									for="ref-subdivision"
									class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
									>Subdivision</label
								>
								<select
									id="ref-subdivision"
									bind:value={form.extra.subdivision}
									class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
								>
									<option value="">— none —</option>
									<option value="corp.">corp. (corpus)</option>
									<option value="s.c.">s.c. (sed contra)</option>
									<option value="ad 1">ad 1</option>
									<option value="ad 2">ad 2</option>
									<option value="ad 3">ad 3</option>
									<option value="obj. 1">obj. 1</option>
									<option value="obj. 2">obj. 2</option>
									<option value="obj. 3">obj. 3</option>
								</select>
							</div>
						{:else if form.type === 'biblical'}
							<p
								class="rounded-md bg-paper-ui px-3 py-2 font-sans text-xs text-ink-muted dark:bg-dark-paper-ui dark:text-dark-ink-muted"
							>
								Use <strong>Title</strong> for the full name of the translation (e.g.
								<em>The Holy Bible, New Revised Standard Version</em>). Biblical citations appear as
								inline parentheticals — usually not in the bibliography.
							</p>
							<div>
								<label
									for="ref-translation"
									class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
									>Translation</label
								>
								<select
									id="ref-translation"
									bind:value={form.extra.translation}
									class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
								>
									<option value="">— select —</option>
									<option value="RSV">RSV (Revised Standard Version)</option>
									<option value="NRSV">NRSV (New Revised Standard Version)</option>
									<option value="NAB">NAB (New American Bible)</option>
									<option value="NABRE">NABRE (New American Bible Revised Edition)</option>
									<option value="DRB">DRB (Douay-Rheims Bible)</option>
									<option value="NIV">NIV (New International Version)</option>
									<option value="ESV">ESV (English Standard Version)</option>
									<option value="LXX">LXX (Septuagint)</option>
									<option value="Vg">Vg (Vulgata)</option>
									<option value="BHS">BHS (Biblia Hebraica Stuttgartensia)</option>
								</select>
							</div>
							<!-- Book / chapter / verse for inline citation (Jn 1:1 NRSV) -->
							<div class="grid grid-cols-4 gap-2">
								<div class="col-span-2">
									<label
										for="ref-bib-book"
										class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
										>Book</label
									>
									<input
										id="ref-bib-book"
										type="text"
										placeholder="Jn, Rom, Gen…"
										bind:value={form.extra.book}
										class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-mono text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
									/>
								</div>
								<div>
									<label
										for="ref-bib-chapter"
										class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
										>Chapter</label
									>
									<input
										id="ref-bib-chapter"
										type="text"
										placeholder="1"
										bind:value={form.extra.chapter}
										class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-mono text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
									/>
								</div>
								<div>
									<label
										for="ref-bib-verse"
										class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
										>Verse(s)</label
									>
									<input
										id="ref-bib-verse"
										type="text"
										placeholder="1–3"
										bind:value={form.extra.verse}
										class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-mono text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
									/>
								</div>
							</div>
							<div class="flex items-center gap-2">
								<input
									id="ref-deutero"
									type="checkbox"
									checked={form.extra.deuterocanonical === 'true'}
									onchange={(e) => {
										form.extra.deuterocanonical = (e.currentTarget as HTMLInputElement).checked
											? 'true'
											: '';
									}}
									class="h-4 w-4 rounded border-paper-border accent-accent"
								/>
								<label for="ref-deutero" class="font-sans text-sm text-ink dark:text-dark-ink"
									>Includes deuterocanonical / apocryphal books</label
								>
							</div>
						{:else if form.type === 'classical'}
							<p
								class="rounded-md bg-paper-ui px-3 py-2 font-sans text-xs text-ink-muted dark:bg-dark-paper-ui dark:text-dark-ink-muted"
							>
								For Plato (Stephanus), Aristotle (Bekker), and other ancient authors with canonical
								numbering. Cite by canonical passage, independent of edition.
							</p>
							<div class="grid grid-cols-2 gap-2">
								<div>
									<label
										for="ref-pagination"
										class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
										>Pagination system</label
									>
									<select
										id="ref-pagination"
										bind:value={form.extra.pagination_system}
										class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
									>
										<option value="">— select —</option>
										<option value="stephanus">Stephanus (Plato)</option>
										<option value="bekker">Bekker (Aristotle)</option>
										<option value="diels">Diels-Kranz (Presocratics)</option>
										<option value="other">Other / none</option>
									</select>
								</div>
								<div>
									<label
										for="ref-work-abbrev"
										class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
										>Work abbreviation</label
									>
									<input
										id="ref-work-abbrev"
										type="text"
										placeholder="Rep., Met., NE…"
										bind:value={form.extra.work_abbrev}
										class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-mono text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
									/>
								</div>
							</div>
							<div>
								<label
									for="ref-passage"
									class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
									>Passage</label
								>
								<input
									id="ref-passage"
									type="text"
									placeholder="514a–520a  or  1045b23–35"
									bind:value={form.extra.passage}
									class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-mono text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
								/>
							</div>
							<div>
								<label
									for="ref-translator"
									class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
									>Translator</label
								>
								<input
									id="ref-translator"
									type="text"
									placeholder="G.M.A. Grube"
									bind:value={form.extra.translator}
									class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
								/>
							</div>
						{:else if form.type === 'earlymodern'}
							<p
								class="rounded-md bg-paper-ui px-3 py-2 font-sans text-xs text-ink-muted dark:bg-dark-paper-ui dark:text-dark-ink-muted"
							>
								For Descartes, Kant, Spinoza, Hegel, Hume, Leibniz, etc. Cite by standard edition
								sigla (AT, AA, KrV A/B, GW…) or section/paragraph.
							</p>
							<div class="grid grid-cols-2 gap-2">
								<div>
									<label
										for="ref-sigla"
										class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
										>Edition sigla</label
									>
									<input
										id="ref-sigla"
										type="text"
										placeholder="AT, AA, KrV, GW…"
										bind:value={form.extra.edition_sigla}
										class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-mono text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
									/>
								</div>
								<div>
									<label
										for="ref-em-section"
										class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
										>Section / §</label
									>
									<input
										id="ref-em-section"
										type="text"
										placeholder="A123/B456  or  §142  or  7:45"
										bind:value={form.extra.section}
										class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-mono text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
									/>
								</div>
							</div>
							<div class="grid grid-cols-2 gap-2">
								<div>
									<label
										for="ref-em-translator"
										class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
										>Translator</label
									>
									<input
										id="ref-em-translator"
										type="text"
										placeholder="Norman Kemp Smith"
										bind:value={form.extra.translator}
										class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
									/>
								</div>
								<div>
									<label
										for="ref-orig-year"
										class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
										>Original year</label
									>
									<input
										id="ref-orig-year"
										type="text"
										placeholder="1781"
										bind:value={form.extra.original_year}
										class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
									/>
								</div>
							</div>
						{/if}

						<!-- Common optional fields -->
						<div>
							<label
								for="ref-doi"
								class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
								>DOI</label
							>
							<input
								id="ref-doi"
								type="text"
								bind:value={form.doi}
								placeholder="10.xxxx/xxxxx"
								class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
							/>
						</div>
						<div>
							<label
								for="ref-url"
								class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
								>URL</label
							>
							<input
								id="ref-url"
								type="text"
								bind:value={form.url}
								class="w-full rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
							/>
						</div>
						<div>
							<label
								for="ref-abstract"
								class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
								>Resumen</label
							>
							<textarea
								id="ref-abstract"
								bind:value={form.abstract}
								rows={3}
								class="w-full resize-none rounded-md border border-paper-border bg-paper-ui px-2.5 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
							></textarea>
						</div>

						{#if saveError}
							<p
								class="rounded-lg bg-red-50 px-3 py-2 font-sans text-xs text-red-600 dark:bg-red-950/30 dark:text-red-400"
							>
								{saveError}
							</p>
						{/if}
					</div>

					<!-- Panel footer -->
					<div
						class="flex justify-end gap-2 border-t border-paper-border px-5 py-3 dark:border-dark-paper-border"
					>
						<button
							onclick={closePanel}
							disabled={saving}
							class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted hover:bg-paper-ui disabled:opacity-50 dark:border-dark-paper-border dark:text-dark-ink-muted"
						>
							Cancel
						</button>
						<button
							onclick={saveReference}
							disabled={saving || !form.title.trim()}
							class="rounded-md bg-accent px-3 py-1.5 font-sans text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
						>
							{saving ? 'Saving…' : panel === 'edit' ? 'Save changes' : 'Create reference'}
						</button>
					</div>
				</div>
			</div>

			<!-- ── DOI lookup panel ─────────────────────────────────────────────── -->
		{:else if panel === 'doi'}
			<div class="w-full max-w-sm shrink-0">
				<div
					class="sticky top-20 overflow-hidden rounded-2xl border border-paper-border bg-paper dark:border-dark-paper-border dark:bg-dark-paper"
				>
					<div
						class="flex items-center justify-between border-b border-paper-border px-5 py-3.5 dark:border-dark-paper-border"
					>
						<h2 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">
							DOI lookup
						</h2>
						<button
							onclick={closePanel}
							aria-label="Close"
							class="rounded-md p-1 text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
						>
							<svg width="14" height="14" viewBox="0 0 14 14" fill="none"
								><path
									d="M1 1l12 12M13 1L1 13"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linecap="round"
								/></svg
							>
						</button>
					</div>
					<div class="space-y-4 px-5 py-4">
						<div class="flex gap-2">
							<input
								type="text"
								bind:value={doiInput}
								placeholder="10.1000/xyz123 or https://doi.org/..."
								class="min-w-0 flex-1 rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-mono text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
								onkeydown={(e) => e.key === 'Enter' && runDoiLookup()}
							/>
							<button
								onclick={runDoiLookup}
								disabled={doiLoading || !doiInput.trim()}
								class="rounded-md bg-accent px-3 py-2 font-sans text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
							>
								{doiLoading ? '…' : 'Fetch'}
							</button>
						</div>

						{#if doiError}
							<p
								class="rounded-lg bg-red-50 px-3 py-2 font-sans text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400"
							>
								{doiError}
							</p>
						{/if}

						{#if doiResult}
							<div
								class="space-y-1.5 rounded-lg border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
							>
								<p class="font-sans text-xs font-semibold text-ink dark:text-dark-ink">
									{doiResult.title}
								</p>
								{#if doiResult.authors.length}
									<p class="font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
										{doiResult.authors.map((a) => `${a.last}, ${a.first}`).join(' · ')}
									</p>
								{/if}
								<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
									{[doiResult.journal, doiResult.year].filter(Boolean).join(', ')}
									{#if doiResult.doi}<span class="ml-1 font-mono">DOI: {doiResult.doi}</span>{/if}
								</p>
								<p class="font-mono text-[10px] text-accent">@{doiResult.citeKey}</p>
							</div>
							<button
								onclick={acceptDoiResult}
								class="w-full rounded-md bg-accent px-3 py-2 font-sans text-sm font-semibold text-white hover:bg-accent-hover"
							>
								Add to bibliography
							</button>
						{/if}
					</div>
				</div>
			</div>

			<!-- ── URL lookup panel ─────────────────────────────────────────────── -->
		{:else if panel === 'url'}
			<div class="w-full max-w-sm shrink-0">
				<div
					class="sticky top-20 overflow-hidden rounded-2xl border border-paper-border bg-paper dark:border-dark-paper-border dark:bg-dark-paper"
				>
					<div
						class="flex items-center justify-between border-b border-paper-border px-5 py-3.5 dark:border-dark-paper-border"
					>
						<h2 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">
							URL → AI
						</h2>
						<button
							onclick={closePanel}
							aria-label="Close"
							class="rounded-md p-1 text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
						>
							<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"
								><path
									d="M1 1l12 12M13 1L1 13"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linecap="round"
								/></svg
							>
						</button>
					</div>
					<div class="space-y-4 px-5 py-4">
						{#if !data.hasAiKey}
							<div class="flex flex-col gap-3 py-2">
								<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
									This feature requires an AI model. Configure your API key to extract metadata from URLs.
								</p>
								<a
									href="/settings#ai"
									class="self-start rounded-md bg-accent px-3 py-2 font-sans text-xs font-semibold text-white transition-colors hover:bg-accent-hover"
								>
									Go to Settings → AI Assistant
								</a>
							</div>
						{:else}
						<p class="font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
							Paste the URL of a webpage. Your AI model will extract the bibliographic metadata.
							The page must be publicly accessible.
						</p>
						<div class="flex gap-2">
							<input
								type="url"
								bind:value={urlInput}
								placeholder="https://..."
								class="min-w-0 flex-1 rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
								onkeydown={(e) => e.key === 'Enter' && runUrlLookup()}
							/>
							<button
								onclick={runUrlLookup}
								disabled={urlLoading || !urlInput.trim()}
								class="rounded-md bg-accent px-3 py-2 font-sans text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
							>
								{urlLoading ? '…' : 'Extract'}
							</button>
						</div>

						{#if urlLoading}
							<p class="font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
								Fetching page and extracting metadata…
							</p>
						{/if}

						{#if urlError}
							<p
								class="rounded-lg bg-red-50 px-3 py-2 font-sans text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400"
							>
								{urlError}
							</p>
						{/if}

						{#if urlResult}
							<div
								class="space-y-1.5 rounded-lg border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
							>
								<p class="font-sans text-xs font-semibold text-ink dark:text-dark-ink">
									{urlResult.title}
								</p>
								{#if urlResult.authors.length}
									<p class="font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
										{urlResult.authors.map((a) => `${a.last}, ${a.first}`).join(' · ')}
									</p>
								{/if}
								<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
									{[urlResult.journal, urlResult.year].filter(Boolean).join(', ')}
								</p>
								<p class="font-mono text-[10px] text-accent">@{urlResult.citeKey}</p>
								<p class="truncate font-sans text-[10px] text-ink-faint dark:text-dark-ink-faint">
									{urlResult.url}
								</p>
							</div>
							<p class="font-sans text-[11px] text-ink-muted dark:text-dark-ink-muted">
								Review and edit the fields after adding if needed.
							</p>
							<label class="flex cursor-pointer items-center gap-2">
								<input
									type="checkbox"
									bind:checked={urlSavePdf}
									class="h-3.5 w-3.5 rounded accent-accent"
								/>
								<span class="font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
									Save a PDF snapshot
								</span>
							</label>
							<button
								onclick={acceptUrlResult}
								class="w-full rounded-md bg-accent px-3 py-2 font-sans text-sm font-semibold text-white hover:bg-accent-hover"
							>
								Add to bibliography
							</button>
						{/if}
						{/if}
					</div>
				</div>
			</div>

			<!-- ── Import panel ──────────────────────────────────────────────── -->
		{:else if panel === 'import'}
			<div class="w-full max-w-sm shrink-0">
				<div
					class="sticky top-20 overflow-hidden rounded-2xl border border-paper-border bg-paper dark:border-dark-paper-border dark:bg-dark-paper"
				>
					<div
						class="flex items-center justify-between border-b border-paper-border px-5 py-3.5 dark:border-dark-paper-border"
					>
						<h2 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">
							Import BibTeX
						</h2>
						<button
							onclick={closePanel}
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

					<div class="space-y-4 px-5 py-4">
						<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
							Paste the contents of a <code
								class="rounded bg-paper-ui px-1 font-mono text-xs dark:bg-dark-paper-ui">.bib</code
							> file or several BibTeX entries.
						</p>

						<label
							class="mb-2 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-paper-border px-3 py-2.5 font-sans text-xs text-ink-muted transition-colors hover:border-accent hover:text-accent dark:border-dark-paper-border dark:text-dark-ink-muted"
						>
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline
									points="17 8 12 3 7 8"
								/><line x1="12" y1="3" x2="12" y2="15" /></svg
							>
							Load .bib file
							<input
								type="file"
								accept=".bib,.bibtex"
								class="sr-only"
								onchange={async (e) => {
									const file = (e.currentTarget as HTMLInputElement).files?.[0];
									if (file) importRaw = await file.text();
								}}
							/>
						</label>
						<div>
							<label
								for="import-raw"
								class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
							>
								BibTeX content
								{#if importPreview() > 0}
									<span class="ml-1 text-accent"
										>· {importPreview()}
										{importPreview() === 1 ? 'entry' : 'entries'} detected</span
									>
								{/if}
							</label>
							<textarea
								id="import-raw"
								bind:value={importRaw}
								rows={12}
								placeholder={'@article{smith2024,\n  title = {Example},\n  author = {Smith, John},\n  year = {2024},\n  journal = {Nature}\n}'}
								class="w-full resize-y rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-mono text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
							></textarea>
						</div>

						{#if importResult}
							<div
								class="rounded-lg border border-green-200 bg-green-50 px-3 py-2 dark:border-green-800/40 dark:bg-green-950/30"
							>
								<p class="font-sans text-sm text-green-700 dark:text-green-400">
									✓ {importResult.inserted}
									{importResult.inserted === 1 ? 'reference imported' : 'references imported'}
									{#if importResult.skipped > 0}
										· {importResult.skipped} skipped
									{/if}
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
					</div>

					<div
						class="flex justify-end gap-2 border-t border-paper-border px-5 py-3 dark:border-dark-paper-border"
					>
						<button
							onclick={closePanel}
							class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted"
						>
							Close
						</button>
						<button
							onclick={runImport}
							disabled={importing || importPreview() === 0}
							class="rounded-md bg-accent px-3 py-1.5 font-sans text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
						>
							{importing ? 'Importing…' : `Import ${importPreview() > 0 ? importPreview() : ''}`}
						</button>
					</div>
				</div>
			</div>
		{:else if panel === 'link-library'}
		<!-- ── Link from library panel ───────────────────────────────────── -->
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
						onclick={closePanel}
						aria-label="Close"
						class="rounded-md p-1 text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
					>
						<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
							<path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
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
						{#if llProjects.length > 0}
							<select
								bind:value={llFilterProjectId}
								class="w-full rounded-md border border-paper-border bg-paper-ui px-3 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
							>
								<option value="">All library</option>
								{#each llProjects as p (p.id)}
									<option value={p.id}>{p.title}</option>
								{/each}
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
								{llSelectedIds.size} / {llFiltered().length} selected
							</span>
							<button
								type="button"
								onclick={llToggleAll}
								class="font-sans text-xs text-accent hover:underline"
							>
								{llSelectedIds.size === llFiltered().length && llFiltered().length > 0 ? 'Deselect all' : 'Select all'}
							</button>
						</div>
						<div class="max-h-72 overflow-y-auto rounded-md border border-paper-border dark:border-dark-paper-border">
							{#each llFiltered() as ref (ref.id)}
								{@const author = (ref.authors as Author[])[0]?.last ?? ''}
								<label
									class="flex cursor-pointer items-start gap-2.5 border-b border-paper-border px-3 py-2.5 last:border-b-0 hover:bg-paper-ui dark:border-dark-paper-border dark:hover:bg-dark-paper-ui"
								>
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
										</p>
									</div>
								</label>
							{/each}
							{#if llFiltered().length === 0}
								<p class="px-3 py-4 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
									No results for "{llSearch}"
								</p>
							{/if}
							</div>
						{/if}

						{#if references.length > 0}
							<button
								type="button"
								onclick={() => (llShowLinked = !llShowLinked)}
								class="flex w-full items-center gap-1.5 font-sans text-xs text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
							>
								<svg
									width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"
									class="shrink-0 transition-transform {llShowLinked ? 'rotate-90' : ''}"
								>
									<path d="M3 1.5l4 3.5-4 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
								</svg>
								Already in this project ({references.length})
							</button>
							{#if llShowLinked}
								<div class="rounded-md border border-paper-border dark:border-dark-paper-border">
									{#each references as ref (ref.id)}
										{@const author = (ref.authors as Author[])[0]?.last ?? ''}
										<div class="flex items-start gap-2.5 border-b border-paper-border px-3 py-2 last:border-b-0 opacity-50 dark:border-dark-paper-border">
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
							<p class="rounded-lg bg-red-50 px-3 py-2 font-sans text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">
								{llError}
							</p>
						{/if}
					</div>

					<div class="flex justify-end gap-2 border-t border-paper-border px-5 py-3 dark:border-dark-paper-border">
						<button
							onclick={closePanel}
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
		{/if}
	</div>
</div>

{#if showSemanticSearch}
	<div
		class="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-20 backdrop-blur-sm"
		role="dialog"
		aria-modal="true"
		aria-labelledby="semantic-search-title"
	>
		<div
			class="flex w-full max-w-2xl flex-col gap-4 rounded-2xl border border-paper-border bg-paper p-6 shadow-xl dark:border-dark-paper-border dark:bg-dark-paper"
		>
			<div class="flex items-center justify-between">
				<h2
					id="semantic-search-title"
					class="font-serif text-base font-semibold text-ink dark:text-dark-ink"
				>
					Search Semantic Scholar
				</h2>
				<button
					onclick={() => (showSemanticSearch = false)}
					class="rounded p-1 text-ink-faint transition-colors hover:text-ink dark:text-dark-ink-faint dark:hover:text-dark-ink"
					aria-label="Close"
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path
							d="M18 6 6 18M6 6l12 12"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
						/>
					</svg>
				</button>
			</div>

			<form
				onsubmit={(e) => {
					e.preventDefault();
					searchSemantic();
				}}
				class="flex gap-2"
			>
				<input
					bind:value={semanticQuery}
					placeholder="Title, author or keywords…"
					class="flex-1 rounded-lg border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
					autofocus
				/>
				<button
					type="submit"
					disabled={semanticLoading || !semanticQuery.trim()}
					class="rounded-lg bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
				>
					{semanticLoading ? 'Searching…' : 'Search'}
				</button>
			</form>

			{#if semanticError}
				<p class="font-sans text-sm text-red-500">{semanticError}</p>
			{/if}

			{#if semanticResults.length > 0}
				<div class="flex flex-col gap-2 overflow-y-auto" style="max-height: 420px;">
					{#each semanticResults as result (result.paperId)}
						<div
							class="flex items-start gap-3 rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
						>
							<div class="min-w-0 flex-1">
								<p class="font-sans text-sm leading-snug font-medium text-ink dark:text-dark-ink">
									{result.title}
								</p>
								<p class="mt-1 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
									{result.authors
										.slice(0, 3)
										.map((a) => a.name)
										.join(', ')}{result.authors.length > 3 ? ' et al.' : ''}
									{#if result.year}
										· {result.year}{/if}
									{#if result.venue}
										· <span class="italic">{result.venue}</span>{/if}
								</p>
								{#if result.externalIds?.DOI}
									<p class="mt-0.5 font-mono text-xs text-ink-faint dark:text-dark-ink-faint">
										DOI: {result.externalIds.DOI}
									</p>
								{/if}
							</div>
							<button
								onclick={() => addSemanticResult(result)}
								disabled={semanticAdding.has(result.paperId)}
								class="shrink-0 rounded-lg border border-accent px-3 py-1.5 font-sans text-xs font-medium text-accent transition-colors hover:bg-accent hover:text-white disabled:opacity-50"
							>
								{semanticAdding.has(result.paperId) ? 'Adding…' : '+ Add'}
							</button>
						</div>
					{/each}
				</div>
			{:else if !semanticLoading && semanticQuery && !semanticError}
				<p class="py-4 text-center font-sans text-sm text-ink-faint dark:text-dark-ink-faint">
					No results. Try different terms.
				</p>
			{/if}
		</div>
	</div>
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
