<script lang="ts">
	import { trpc } from '$lib/utils/trpc';
	import { invalidateAll } from '$app/navigation';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	let {
		projectId,
		onclose
	}: {
		projectId: string;
		onclose: () => void;
	} = $props();

	let title = $state('');
	let text = $state('');
	let titleTouched = $state(false);
	let importing = $state(false);
	let error = $state('');
	let copyrightConsent = $state(false);
	let refSearch = $state('');
	let refResults = $state<{ id: string; citeKey: string; title: string; year: string }[]>([]);
	let refLoading = $state(false);
	let selectedRef = $state<{ id: string; citeKey: string; title: string } | null>(null);

	async function searchRefs(q: string) {
		if (!q.trim()) {
			refResults = [];
			return;
		}
		refLoading = true;
		try {
			const all = await trpc.references.listAll.query();
			const lower = q.toLowerCase();
			refResults = all
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
			refLoading = false;
		}
	}

	function onTextInput(e: Event) {
		text = (e.currentTarget as HTMLTextAreaElement).value;
		if (!titleTouched) {
			const firstLine = text.split('\n').find((l) => l.trim());
			title = firstLine?.trim().slice(0, 250) ?? '';
		}
	}

	async function doImport() {
		if (!title.trim() || !text.trim()) return;
		importing = true;
		error = '';
		try {
			await trpc.projects.importText.mutate({
				projectId,
				title: title.trim(),
				text: text.trim(),
				referenceId: selectedRef?.id
			});
			await invalidateAll();
			onclose();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Import failed.';
		} finally {
			importing = false;
		}
	}
</script>

<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
	role="dialog"
	aria-modal="true"
>
	<div class="absolute inset-0" aria-hidden="true" onclick={() => onclose()}></div>
	<div
		class="relative flex w-full max-w-lg flex-col rounded-2xl border border-paper-border bg-paper shadow-2xl dark:border-dark-paper-border dark:bg-dark-paper"
		style="max-height: 90vh;"
	>
		<div class="shrink-0 px-6 pt-6 pb-4">
			<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">
				Import book text
			</h2>
			<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				Pega el contenido en texto plano (obtenido con Calibre u otra herramienta).
			</p>
		</div>

		<div class="min-h-0 flex-1 overflow-y-auto px-6">
			<!-- Title -->
			<div class="mb-4">
				<label
					for="import-title"
					class="mb-1.5 block font-sans text-xs font-medium text-ink dark:text-dark-ink"
				>
					Título del documento
				</label>
				<input
					id="import-title"
					type="text"
					bind:value={title}
					oninput={() => (titleTouched = true)}
					placeholder="Título del libro…"
					class="w-full rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
				/>
			</div>

			<!-- Reference picker -->
			<div class="mb-4">
				<p class="mb-1.5 font-sans text-xs font-medium text-ink dark:text-dark-ink">
					Referencia bibliográfica <span class="font-normal text-ink-faint">(opcional)</span>
				</p>
				{#if selectedRef}
					<div
						class="flex items-center justify-between rounded-md border border-accent/40 bg-accent/5 px-3 py-2 dark:border-accent/30 dark:bg-accent/10"
					>
						<div class="min-w-0">
							<p class="truncate font-sans text-sm font-medium text-ink dark:text-dark-ink">
								{selectedRef.title}
							</p>
							<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
								{selectedRef.citeKey}
							</p>
						</div>
						<button
							type="button"
							onclick={() => {
								selectedRef = null;
								refSearch = '';
							}}
							class="ml-2 shrink-0 rounded p-0.5 text-ink-faint hover:text-ink dark:text-dark-ink-faint dark:hover:text-dark-ink"
							>✕</button
						>
					</div>
				{:else}
					<div class="relative">
						<input
							type="text"
							bind:value={refSearch}
							oninput={() => searchRefs(refSearch)}
							placeholder="Buscar por título, autor o citeKey…"
							class="w-full rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
						/>
						{#if refLoading}
							<div class="absolute top-2 right-2"><Spinner size="sm" /></div>
						{/if}
						{#if refResults.length > 0}
							<div
								class="absolute top-full right-0 left-0 z-10 mt-1 max-h-48 overflow-y-auto rounded-md border border-paper-border bg-paper shadow-lg dark:border-dark-paper-border dark:bg-dark-paper"
							>
								{#each refResults as ref (ref.id)}
									<button
										type="button"
										onclick={() => {
											selectedRef = ref;
											refSearch = '';
											refResults = [];
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

			<!-- Text content -->
			<div class="mb-4">
				<label
					for="import-text"
					class="mb-1.5 block font-sans text-xs font-medium text-ink dark:text-dark-ink"
				>
					Contenido
				</label>
				<textarea
					id="import-text"
					oninput={onTextInput}
					placeholder="Pega aquí el texto del libro…"
					rows="10"
					class="w-full resize-y rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
				></textarea>
			</div>

			<!-- Copyright consent -->
			<label class="mb-4 flex cursor-pointer items-start gap-2.5">
				<input
					type="checkbox"
					bind:checked={copyrightConsent}
					class="mt-0.5 h-4 w-4 shrink-0 accent-accent"
				/>
				<span class="font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					I confirm that I have the right to process this content on this platform. I am solely
					responsible for compliance with applicable copyright law.
				</span>
			</label>

			{#if error}
				<p class="mb-3 font-sans text-xs text-red-500">{error}</p>
			{/if}
		</div>

		<div
			class="flex shrink-0 justify-end gap-2 border-t border-paper-border px-6 py-4 dark:border-dark-paper-border"
		>
			<button
				onclick={() => onclose()}
				class="rounded-md border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted"
			>
				Cancel
			</button>
			<button
				onclick={doImport}
				disabled={importing || !title.trim() || !text.trim() || !copyrightConsent}
				class="flex items-center gap-2 rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
			>
				{#if importing}<Spinner size="sm" />{/if}
				{importing ? 'Importando…' : 'Import'}
			</button>
		</div>
	</div>
</div>
