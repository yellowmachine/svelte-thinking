<script lang="ts">
	import { trpc } from '$lib/utils/trpc';
	import { invalidateAll } from '$app/navigation';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	let {
		projectId,
		isImporting,
		onclose
	}: {
		projectId: string;
		isImporting: boolean;
		onclose: () => void;
	} = $props();

	let epubUrl = $state('');
	let epubFile = $state<File | null>(null);
	let epubImporting = $state(false);
	let epubError = $state('');
	let epubRefSearch = $state('');
	let epubRefResults = $state<{ id: string; citeKey: string; title: string; year: string }[]>([]);
	let epubRefLoading = $state(false);
	let epubSelectedRef = $state<{ id: string; citeKey: string; title: string } | null>(null);

	let pollInterval: ReturnType<typeof setInterval> | null = null;

	$effect(() => {
		if (!isImporting && pollInterval) {
			clearInterval(pollInterval);
			pollInterval = null;
		}
	});

	async function searchEpubRefs(q: string) {
		if (!q.trim()) {
			epubRefResults = [];
			return;
		}
		epubRefLoading = true;
		try {
			const all = await trpc.references.listAll.query();
			const lower = q.toLowerCase();
			epubRefResults = all
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
			epubRefLoading = false;
		}
	}

	function resetState() {
		epubUrl = '';
		epubFile = null;
		epubError = '';
		epubSelectedRef = null;
		epubRefSearch = '';
		epubRefResults = [];
	}

	async function startEpubImport() {
		const hasUrl = epubUrl.trim().length > 0;
		const hasFile = epubFile !== null;
		if (!hasUrl && !hasFile) return;
		epubImporting = true;
		epubError = '';
		try {
			let url = epubUrl.trim();
			if (hasFile) {
				const fd = new FormData();
				fd.append('file', epubFile!);
				const res = await fetch(`/api/projects/${projectId}/epub`, { method: 'POST', body: fd });
				if (!res.ok) {
					const body = await res.json().catch(() => ({}));
					throw new Error(body.message ?? `Upload failed (${res.status})`);
				}
				const data2 = await res.json();
				url = data2.url;
			}
			await trpc.projects.importEpub.mutate({ projectId, url, referenceId: epubSelectedRef?.id });
			resetState();
			onclose();
			pollInterval = setInterval(async () => {
				await invalidateAll();
			}, 3000);
		} catch (e) {
			epubError = e instanceof Error ? e.message : 'Import failed.';
		} finally {
			epubImporting = false;
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
			resetState();
			onclose();
		}}
	></div>
	<div
		class="relative w-full max-w-md rounded-2xl border border-paper-border bg-paper p-6 shadow-2xl dark:border-dark-paper-border dark:bg-dark-paper"
	>
		<h2 class="mb-4 font-serif text-lg font-semibold text-ink dark:text-dark-ink">Import EPUB</h2>
		<p class="mb-3 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Sube un fichero .epub o introduce una URL. Cada capítulo se importará como documento readonly.
		</p>

		<!-- Reference picker -->
		<div class="mb-4">
			<p class="mb-1.5 font-sans text-xs font-medium text-ink dark:text-dark-ink">
				Referencia bibliográfica <span class="font-normal text-ink-faint"
					>(opcional — se creará automáticamente si no seleccionas)</span
				>
			</p>
			{#if epubSelectedRef}
				<div
					class="flex items-center justify-between rounded-md border border-accent/40 bg-accent/5 px-3 py-2 dark:border-accent/30 dark:bg-accent/10"
				>
					<div class="min-w-0">
						<p class="truncate font-sans text-sm font-medium text-ink dark:text-dark-ink">
							{epubSelectedRef.title}
						</p>
						<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
							{epubSelectedRef.citeKey}
						</p>
					</div>
					<button
						type="button"
						onclick={() => {
							epubSelectedRef = null;
							epubRefSearch = '';
							epubRefResults = [];
						}}
						class="ml-2 shrink-0 rounded p-0.5 text-ink-faint hover:text-ink dark:text-dark-ink-faint dark:hover:text-dark-ink"
						>✕</button
					>
				</div>
			{:else}
				<div class="relative">
					<input
						type="text"
						bind:value={epubRefSearch}
						oninput={() => searchEpubRefs(epubRefSearch)}
						placeholder="Buscar por título, autor o citeKey…"
						class="w-full rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
					/>
					{#if epubRefLoading}
						<div class="absolute top-2 right-2"><Spinner size="sm" /></div>
					{/if}
					{#if epubRefResults.length > 0}
						<div
							class="absolute top-full right-0 left-0 z-10 mt-1 max-h-48 overflow-y-auto rounded-md border border-paper-border bg-paper shadow-lg dark:border-dark-paper-border dark:bg-dark-paper"
						>
							{#each epubRefResults as ref (ref.id)}
								<button
									type="button"
									onclick={() => {
										epubSelectedRef = ref;
										epubRefSearch = '';
										epubRefResults = [];
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

		<!-- File upload -->
		<label
			class="mb-3 flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink-muted hover:border-accent dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink-muted dark:hover:border-accent"
		>
			<input
				type="file"
				accept=".epub,application/epub+zip"
				class="hidden"
				onchange={(e) => {
					const f = (e.currentTarget as HTMLInputElement).files?.[0] ?? null;
					epubFile = f;
					if (f) epubUrl = '';
				}}
			/>
			{#if epubFile}
				<span class="truncate text-ink dark:text-dark-ink">{epubFile.name}</span>
				<button
					type="button"
					class="ml-auto shrink-0 text-ink-faint hover:text-ink dark:text-dark-ink-faint dark:hover:text-dark-ink"
					onclick={(e) => {
						e.preventDefault();
						epubFile = null;
					}}>✕</button
				>
			{:else}
				<span>Seleccionar fichero .epub…</span>
			{/if}
		</label>

		<!-- Divider -->
		<div class="my-3 flex items-center gap-2">
			<div class="h-px flex-1 bg-paper-border dark:bg-dark-paper-border"></div>
			<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">o URL</span>
			<div class="h-px flex-1 bg-paper-border dark:bg-dark-paper-border"></div>
		</div>

		<!-- URL input -->
		<input
			type="url"
			bind:value={epubUrl}
			placeholder="https://example.org/book.epub"
			oninput={() => {
				if (epubUrl) epubFile = null;
			}}
			class="w-full rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
		/>
		{#if epubError}
			<p class="mt-2 font-sans text-xs text-red-500">{epubError}</p>
		{/if}
		<div class="mt-4 flex justify-end gap-2">
			<button
				onclick={() => {
					resetState();
					onclose();
				}}
				class="rounded-md border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted"
			>
				Cancel
			</button>
			<button
				onclick={startEpubImport}
				disabled={epubImporting || (!epubUrl.trim() && !epubFile)}
				class="flex items-center gap-2 rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
			>
				{#if epubImporting}<Spinner size="sm" />{/if}
				{epubImporting ? 'Iniciando…' : 'Import'}
			</button>
		</div>
	</div>
</div>
