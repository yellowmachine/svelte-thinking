<script lang="ts">
	import { trpc } from '$lib/utils/trpc';
	import { goto } from '$app/navigation';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	type UrlAiResult = {
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

	const REF_TYPES = [
		'article',
		'book',
		'inproceedings',
		'incollection',
		'phdthesis',
		'mastersthesis',
		'techreport',
		'misc',
		'newspaper',
		'film',
		'interview'
	] as const;

	let {
		projectId,
		hasAiKey,
		onclose
	}: {
		projectId: string;
		hasAiKey: boolean;
		onclose: () => void;
	} = $props();

	let urlImportUrl = $state('');
	let urlStep = $state<'input' | 'extracting' | 'review'>('input');
	let urlAiResult = $state<UrlAiResult | null>(null);
	let urlImportError = $state('');
	let urlImporting = $state(false);

	let urlEditTitle = $state('');
	let urlEditCiteKey = $state('');
	let urlEditYear = $state('');
	let urlEditType = $state('');
	let urlEditAuthors = $state('');

	let urlImportTitle = $state('');
	let urlRefSearch = $state('');
	let urlRefResults = $state<{ id: string; citeKey: string; title: string; year: string }[]>([]);
	let urlRefLoading = $state(false);
	let urlSelectedRef = $state<{ id: string; citeKey: string; title: string } | null>(null);

	async function searchUrlRefs(q: string) {
		if (!q.trim()) {
			urlRefResults = [];
			return;
		}
		urlRefLoading = true;
		try {
			const all = await trpc.references.listAll.query();
			const lower = q.toLowerCase();
			urlRefResults = all
				.filter(
					(r) =>
						r.title.toLowerCase().includes(lower) ||
						r.citeKey.toLowerCase().includes(lower) ||
						(r.authors as { first: string; last: string }[]).some((a) =>
							a.last.toLowerCase().includes(lower)
						)
				)
				.slice(0, 8)
				.map((r) => ({ id: r.id, citeKey: r.citeKey, title: r.title, year: r.year ?? '' }));
		} finally {
			urlRefLoading = false;
		}
	}

	function reset() {
		urlImportUrl = '';
		urlStep = 'input';
		urlAiResult = null;
		urlImportError = '';
		urlImportTitle = '';
		urlSelectedRef = null;
		urlRefSearch = '';
		urlRefResults = [];
	}

	async function runUrlAiExtract() {
		if (!urlImportUrl.trim()) return;
		urlStep = 'extracting';
		urlImportError = '';
		try {
			const result = (await trpc.references.fetchUrl.query({
				url: urlImportUrl.trim(),
				projectId
			})) as UrlAiResult;
			urlAiResult = result;
			urlEditTitle = result.title;
			urlEditCiteKey = result.citeKey;
			urlEditYear = result.year ?? '';
			urlEditType = result.type;
			urlEditAuthors = result.authors
				.map((a) => `${a.last}, ${a.first}`.trim().replace(/,\s*$/, ''))
				.join('\n');
			urlStep = 'review';
		} catch (e) {
			urlImportError = e instanceof Error ? e.message : 'No se pudo extraer metadata de la URL.';
			urlStep = 'input';
		}
	}

	function parseAuthors(raw: string): { first: string; last: string }[] {
		return raw
			.split('\n')
			.map((line) => {
				const [last = '', first = ''] = line.split(',').map((s) => s.trim());
				return { first, last };
			})
			.filter((a) => a.last);
	}

	async function startUrlImport() {
		urlImporting = true;
		urlImportError = '';
		try {
			if (urlStep === 'review' && urlAiResult) {
				const newRef = await trpc.references.create.mutate({
					projectId,
					reference: {
						citeKey: urlEditCiteKey.trim(),
						type: urlEditType as never,
						title: urlEditTitle.trim(),
						authors: parseAuthors(urlEditAuthors),
						editors: [],
						year: urlEditYear.trim(),
						abstract: urlAiResult.abstract ?? '',
						journal: urlAiResult.journal ?? '',
						volume: urlAiResult.volume ?? '',
						issue: urlAiResult.issue ?? '',
						pages: urlAiResult.pages ?? '',
						publisher: urlAiResult.publisher ?? '',
						booktitle: urlAiResult.booktitle ?? '',
						school: urlAiResult.school ?? '',
						institution: urlAiResult.institution ?? '',
						url: urlAiResult.url,
						doi: '',
						note: '',
						isbn: '',
						address: '',
						edition: '',
						series: '',
						reportNumber: '',
						organization: '',
						extra: {}
					}
				});
				const { docId } = await trpc.references.importDocumentFromUrl.mutate({
					url: urlImportUrl.trim(),
					projectId,
					title: urlEditTitle.trim(),
					referenceId: newRef.id
				});
				reset();
				onclose();
				await goto(`/projects/${projectId}/documents/${docId}`);
			} else {
				if (!urlImportUrl.trim() || !urlImportTitle.trim()) return;
				const { docId } = await trpc.references.importDocumentFromUrl.mutate({
					url: urlImportUrl.trim(),
					projectId,
					title: urlImportTitle.trim(),
					referenceId: urlSelectedRef?.id
				});
				reset();
				onclose();
				await goto(`/projects/${projectId}/documents/${docId}`);
			}
		} catch (e) {
			urlImportError = e instanceof Error ? e.message : 'Import failed.';
		} finally {
			urlImporting = false;
		}
	}
</script>

<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
	role="dialog"
	aria-modal="true"
>
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		class="absolute inset-0"
		onclick={() => {
			reset();
			onclose();
		}}
	></div>
	<div
		class="relative w-full max-w-lg rounded-2xl border border-paper-border bg-paper p-6 shadow-2xl dark:border-dark-paper-border dark:bg-dark-paper"
	>
		{#if urlStep === 'input' || urlStep === 'extracting'}
			<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">Import URL</h2>
			<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				Pega la URL de un artículo o página web.
			</p>

			<input
				type="url"
				bind:value={urlImportUrl}
				placeholder="https://example.org/article"
				autofocus
				onkeydown={(e) => {
					if (e.key === 'Enter' && hasAiKey) runUrlAiExtract();
				}}
				class="mb-3 w-full rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
			/>

			{#if !hasAiKey}
				<div class="mb-3">
					<p class="mb-1.5 font-sans text-xs font-medium text-ink dark:text-dark-ink">
						Referencia bibliográfica <span class="font-normal text-ink-faint">(opcional)</span>
					</p>
					{#if urlSelectedRef}
						<div
							class="flex items-center justify-between rounded-md border border-accent/40 bg-accent/5 px-3 py-2 dark:border-accent/30 dark:bg-accent/10"
						>
							<div class="min-w-0">
								<p class="truncate font-sans text-sm font-medium text-ink dark:text-dark-ink">
									{urlSelectedRef.title}
								</p>
								<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
									{urlSelectedRef.citeKey}
								</p>
							</div>
							<button
								type="button"
								onclick={() => {
									urlSelectedRef = null;
									urlRefSearch = '';
									urlRefResults = [];
								}}
								class="ml-2 shrink-0 rounded p-0.5 text-ink-faint hover:text-ink dark:text-dark-ink-faint dark:hover:text-dark-ink"
								>✕</button
							>
						</div>
					{:else}
						<div class="relative">
							<input
								type="text"
								bind:value={urlRefSearch}
								oninput={() => searchUrlRefs(urlRefSearch)}
								placeholder="Buscar por título, autor o citeKey…"
								class="w-full rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
							/>
							{#if urlRefLoading}<div class="absolute top-2 right-2">
									<Spinner size="sm" />
								</div>{/if}
							{#if urlRefResults.length > 0}
								<div
									class="absolute top-full right-0 left-0 z-10 mt-1 max-h-48 overflow-y-auto rounded-md border border-paper-border bg-paper shadow-lg dark:border-dark-paper-border dark:bg-dark-paper"
								>
									{#each urlRefResults as ref (ref.id)}
										<button
											type="button"
											onclick={() => {
												urlSelectedRef = ref;
												urlRefSearch = '';
												urlRefResults = [];
											}}
											class="flex w-full flex-col px-3 py-2 text-left hover:bg-paper-ui dark:hover:bg-dark-paper-ui"
										>
											<span class="truncate font-sans text-sm text-ink dark:text-dark-ink"
												>{ref.title}</span
											>
											<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint"
												>{ref.citeKey}{ref.year ? ` · ${ref.year}` : ''}</span
											>
										</button>
									{/each}
								</div>
							{/if}
						</div>
					{/if}
				</div>
				<input
					type="text"
					bind:value={urlImportTitle}
					placeholder="Título del documento"
					onkeydown={(e) => {
						if (e.key === 'Enter' && urlImportUrl.trim() && urlImportTitle.trim()) startUrlImport();
					}}
					class="w-full rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
				/>
			{/if}

			{#if urlImportError}
				<p class="mt-2 font-sans text-xs text-red-500">{urlImportError}</p>
			{/if}

			<div class="mt-4 flex justify-end gap-2">
				<button
					onclick={() => {
						reset();
						onclose();
					}}
					class="rounded-md border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted"
				>
					Cancelar
				</button>
				{#if hasAiKey}
					<button
						onclick={runUrlAiExtract}
						disabled={urlStep === 'extracting' || !urlImportUrl.trim()}
						class="flex items-center gap-2 rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
					>
						{#if urlStep === 'extracting'}<Spinner size="sm" />{/if}
						{urlStep === 'extracting' ? 'Extrayendo…' : 'Extraer con IA'}
					</button>
				{:else}
					<button
						onclick={startUrlImport}
						disabled={urlImporting || !urlImportUrl.trim() || !urlImportTitle.trim()}
						class="flex items-center gap-2 rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
					>
						{#if urlImporting}<Spinner size="sm" />{/if}
						{urlImporting ? 'Importando…' : 'Import'}
					</button>
				{/if}
			</div>
		{:else if urlStep === 'review'}
			<div class="mb-4 flex items-center gap-2">
				<button
					onclick={() => {
						urlStep = 'input';
						urlAiResult = null;
					}}
					class="rounded p-1 text-ink-faint hover:text-ink dark:text-dark-ink-faint dark:hover:text-dark-ink"
					aria-label="Volver"
				>
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"><polyline points="15 18 9 12 15 6" /></svg
					>
				</button>
				<h2 class="font-serif text-lg font-semibold text-ink dark:text-dark-ink">
					Revisar metadata
				</h2>
			</div>
			<p class="mb-4 truncate font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
				{urlImportUrl}
			</p>

			<div class="space-y-3">
				<div>
					<label class="mb-1 block font-sans text-xs text-ink-faint dark:text-dark-ink-faint"
						>Título</label
					>
					<input
						type="text"
						bind:value={urlEditTitle}
						class="w-full rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
					/>
				</div>
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="mb-1 block font-sans text-xs text-ink-faint dark:text-dark-ink-faint"
							>CiteKey</label
						>
						<input
							type="text"
							bind:value={urlEditCiteKey}
							class="w-full rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-mono text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
						/>
					</div>
					<div>
						<label class="mb-1 block font-sans text-xs text-ink-faint dark:text-dark-ink-faint"
							>Año</label
						>
						<input
							type="text"
							bind:value={urlEditYear}
							placeholder="2024"
							class="w-full rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
						/>
					</div>
				</div>
				<div>
					<label class="mb-1 block font-sans text-xs text-ink-faint dark:text-dark-ink-faint"
						>Tipo</label
					>
					<select
						bind:value={urlEditType}
						class="w-full rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
					>
						{#each REF_TYPES as t}
							<option value={t}>{t}</option>
						{/each}
					</select>
				</div>
				<div>
					<label class="mb-1 block font-sans text-xs text-ink-faint dark:text-dark-ink-faint"
						>Autores <span class="text-ink-faint">(uno por línea: Apellido, Nombre)</span></label
					>
					<textarea
						bind:value={urlEditAuthors}
						rows={3}
						class="w-full resize-none rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
					></textarea>
				</div>
			</div>

			{#if urlImportError}
				<p class="mt-2 font-sans text-xs text-red-500">{urlImportError}</p>
			{/if}

			<div class="mt-4 flex justify-end gap-2">
				<button
					onclick={() => {
						reset();
						onclose();
					}}
					class="rounded-md border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted"
				>
					Cancelar
				</button>
				<button
					onclick={startUrlImport}
					disabled={urlImporting || !urlEditTitle.trim() || !urlEditCiteKey.trim()}
					class="flex items-center gap-2 rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
				>
					{#if urlImporting}<Spinner size="sm" />{/if}
					{urlImporting ? 'Importando…' : 'Importar documento'}
				</button>
			</div>
		{/if}
	</div>
</div>
