<script lang="ts">
	import { untrack } from 'svelte';
	import { trpc } from '$lib/utils/trpc';
	import { generateCiteKey, TYPE_LABELS, ALL_TYPES } from '$lib/utils/bibtex';
	import type { Author, ReferenceType } from '$lib/utils/bibtex';

	type RefInput = {
		id: string;
		citeKey: string;
		type: string;
		title: string;
		authors: unknown;
		year: string | null;
		abstract: string | null;
		doi: string | null;
		url: string | null;
		note: string | null;
		journal: string | null;
		volume: string | null;
		issue: string | null;
		pages: string | null;
		publisher: string | null;
		edition: string | null;
		address: string | null;
		isbn: string | null;
		editors: unknown;
		booktitle: string | null;
		organization: string | null;
		series: string | null;
		school: string | null;
		institution: string | null;
		reportNumber: string | null;
		extra: unknown;
	};

	let {
		mode,
		editingRef = null,
		projectId,
		onclose,
		onsave
	}: {
		mode: 'new' | 'edit';
		editingRef?: RefInput | null;
		projectId: string;
		onclose: () => void;
		onsave: (ref: unknown) => void;
	} = $props();

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
			journal: '',
			volume: '',
			issue: '',
			pages: '',
			publisher: '',
			edition: '',
			address: '',
			isbn: '',
			editors: [] as Author[],
			booktitle: '',
			organization: '',
			series: '',
			school: '',
			institution: '',
			reportNumber: '',
			extra: {} as Record<string, string>
		};
	}

	function initFromRef(ref: RefInput) {
		return {
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
	}

	// eslint-disable-next-line svelte/prefer-writable-derived
	let form = $state(
		untrack(() => (mode === 'edit' && editingRef ? initFromRef(editingRef) : emptyForm()))
	);
	$effect(() => {
		form = mode === 'edit' && editingRef ? initFromRef(editingRef) : emptyForm();
	});
	let saving = $state(false);
	let saveError = $state('');

	function autoCiteKey() {
		if (form.citeKey) return;
		const key = generateCiteKey(form.authors, form.year);
		if (key !== 'ref') form.citeKey = key;
	}

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

			let saved: unknown;
			if (mode === 'edit' && editingRef) {
				saved = await trpc.references.update.mutate({
					id: editingRef.id,
					projectId,
					reference: payload
				});
			} else {
				saved = await trpc.references.create.mutate({
					projectId,
					reference: payload
				});
			}
			onsave(saved);
			onclose();
		} catch (e) {
			saveError = e instanceof Error ? e.message : 'Failed to save';
		} finally {
			saving = false;
		}
	}
</script>

<div class="w-full max-w-sm shrink-0">
	<div
		class="sticky top-20 overflow-hidden rounded-2xl border border-paper-border bg-paper dark:border-dark-paper-border dark:bg-dark-paper"
	>
		<!-- Panel header -->
		<div
			class="flex items-center justify-between border-b border-paper-border px-5 py-3.5 dark:border-dark-paper-border"
		>
			<h2 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">
				{mode === 'edit' ? 'Edit reference' : 'New reference'}
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
						<span class="font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
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
									<button
										onclick={() => removeAuthor(i)}
										class="shrink-0 rounded-md px-1.5 text-ink-faint hover:text-red-500">×</button
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
					Use <strong>Title</strong> for the work name (e.g. <em>Summa Theologiae</em>) and fill
					Author as usual.
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
					For Descartes, Kant, Spinoza, Hegel, Hume, Leibniz, etc. Cite by standard edition sigla
					(AT, AA, KrV A/B, GW…) or section/paragraph.
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
				onclick={onclose}
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
				{saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Create reference'}
			</button>
		</div>
	</div>
</div>
