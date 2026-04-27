<script lang="ts">
	import { trpc } from '$lib/utils/trpc';
	import { parseBibtexFile } from '$lib/utils/bibtex';

	let {
		projectId,
		onclose,
		onimported
	}: {
		projectId: string;
		onclose: () => void;
		onimported: (result: { inserted: number; skipped: number }) => void;
	} = $props();

	let importRaw = $state('');
	let importing = $state(false);
	let importResult = $state<{ inserted: number; skipped: number } | null>(null);
	let importError = $state('');

	const importPreview = $derived.by(() => {
		if (!importRaw.trim()) return 0;
		try {
			return parseBibtexFile(importRaw).length;
		} catch {
			return 0;
		}
	});

	async function runImport() {
		if (importPreview === 0) return;
		importing = true;
		importResult = null;
		importError = '';
		try {
			const result = await trpc.references.importBibtex.mutate({
				projectId,
				raw: importRaw
			});
			importResult = result;
			onimported(result);
		} catch (e) {
			importError = e instanceof Error ? e.message : 'Failed to import';
		} finally {
			importing = false;
		}
	}
</script>

<div class="w-full max-w-sm shrink-0">
	<div
		class="sticky top-20 overflow-hidden rounded-2xl border border-paper-border bg-paper dark:border-dark-paper-border dark:bg-dark-paper"
	>
		<div
			class="flex items-center justify-between border-b border-paper-border px-5 py-3.5 dark:border-dark-paper-border"
		>
			<h2 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">Import BibTeX</h2>
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

		<div class="space-y-4 px-5 py-4">
			<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				Paste the contents of a <code
					class="rounded bg-paper-ui px-1 font-mono text-xs dark:bg-dark-paper-ui">.bib</code
				> file or several BibTeX entries.
			</p>

			<label
				class="mb-2 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-paper-border px-3 py-2.5 font-sans text-xs text-ink-muted transition-colors hover:border-accent hover:text-accent dark:border-dark-paper-border dark:text-dark-ink-muted"
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
					<polyline points="17 8 12 3 7 8" />
					<line x1="12" y1="3" x2="12" y2="15" />
				</svg>
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
					{#if importPreview > 0}
						<span class="ml-1 text-accent">· {importPreview} {importPreview === 1 ? 'entry' : 'entries'} detected</span>
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
						{#if importResult.skipped > 0}· {importResult.skipped} skipped{/if}
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
				onclick={onclose}
				class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted"
			>
				Close
			</button>
			<button
				onclick={runImport}
				disabled={importing || importPreview === 0}
				class="rounded-md bg-accent px-3 py-1.5 font-sans text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
			>
				{importing ? 'Importing…' : `Import${importPreview > 0 ? ` ${importPreview}` : ''}`}
			</button>
		</div>
	</div>
</div>
