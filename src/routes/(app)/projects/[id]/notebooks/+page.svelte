<script lang="ts">
	import { untrack } from 'svelte';
	import type { PageData } from './$types';
	import JupyterImportModal from '$lib/components/projects/JupyterImportModal.svelte';

	let { data }: { data: PageData } = $props();

	type Notebook = (typeof data.notebooks)[number];
	let notebooks = $state<Notebook[]>(untrack(() => data.notebooks));
	$effect(() => {
		notebooks = data.notebooks;
	});

	let uploadingNotebook = $state(false);
	let notebookError = $state('');
	let showJupyterModal = $state(false);

	function formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	async function uploadNotebook(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		uploadingNotebook = true;
		notebookError = '';
		const form = new FormData();
		form.append('file', file);

		try {
			const res = await fetch(`/api/projects/${data.project.id}/notebooks`, {
				method: 'POST',
				body: form
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({ message: 'Upload error' }));
				throw new Error(err.message);
			}
			const created = await res.json();
			notebooks = [created, ...notebooks];
		} catch (err) {
			notebookError = err instanceof Error ? err.message : 'Error importing notebook';
		} finally {
			uploadingNotebook = false;
			input.value = '';
		}
	}

	async function deleteNotebook(id: string) {
		await fetch(`/api/projects/${data.project.id}/notebooks/${id}`, { method: 'DELETE' });
		notebooks = notebooks.filter((n) => n.id !== id);
	}
</script>

<div class="mx-auto max-w-5xl px-6 py-8">
	<!-- Header -->
	<div class="mb-8">
		<button
			onclick={() => (window.location.href = `/projects/${data.project.id}`)}
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
		</button>

		<div class="flex items-center justify-between">
			<div>
				<h1 class="font-serif text-3xl font-semibold text-ink dark:text-dark-ink">Notebooks</h1>
				<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
					Import <code class="rounded bg-paper-ui px-1 font-mono text-xs dark:bg-dark-paper-ui"
						>.ipynb</code
					> files to use as context for the AI agent.
				</p>
			</div>
			<div class="flex items-center gap-2">
				<label
					class="flex cursor-pointer items-center gap-1.5 rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui disabled:pointer-events-none disabled:opacity-50 dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui {uploadingNotebook
						? 'pointer-events-none opacity-50'
						: ''}"
				>
					<svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
						<path
							d="M9.25 13.25a.75.75 0 0 0 1.5 0V4.636l2.955 3.129a.75.75 0 0 0 1.09-1.03l-4.25-4.5a.75.75 0 0 0-1.09 0l-4.25 4.5a.75.75 0 1 0 1.09 1.03L9.25 4.636v8.614Z"
						/>
						<path
							d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z"
						/>
					</svg>
					{uploadingNotebook ? 'Importing…' : 'From file'}
					<input type="file" class="hidden" accept=".ipynb" onchange={uploadNotebook} />
				</label>
				<button
					onclick={() => (showJupyterModal = true)}
					class="flex items-center gap-1.5 rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
				>
					<svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
						<path
							fill-rule="evenodd"
							d="M13.887 3.182c.396.037.79.08 1.183.128C16.194 3.45 17 4.414 17 5.517V16.75A2.25 2.25 0 0 1 14.75 19h-9.5A2.25 2.25 0 0 1 3 16.75V5.517c0-1.103.806-2.068 1.93-2.207.393-.048.787-.09 1.183-.128A3.001 3.001 0 0 1 9 1h2c1.373 0 2.531.923 2.887 2.182ZM7.5 4A1.5 1.5 0 0 1 9 2.5h2A1.5 1.5 0 0 1 12.5 4v.5h-5V4Z"
							clip-rule="evenodd"
						/>
					</svg>
					From remote Jupyter
				</button>
			</div>
		</div>
	</div>

	{#if notebookError}
		<p
			class="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 font-sans text-sm text-red-600 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-400"
		>
			{notebookError}
		</p>
	{/if}

	{#if notebooks.length === 0}
		<div
			class="rounded-xl border border-dashed border-paper-border p-12 text-center dark:border-dark-paper-border"
		>
			<p class="font-sans text-sm text-ink-faint dark:text-dark-ink-faint">
				No notebooks yet. Import a <code
					class="rounded bg-paper-ui px-1 font-mono text-xs dark:bg-dark-paper-ui">.ipynb</code
				> file or connect to a remote Jupyter server.
			</p>
		</div>
	{:else}
		<div
			class="flex flex-col gap-1 rounded-xl border border-paper-border bg-paper p-2 dark:border-dark-paper-border dark:bg-dark-paper"
		>
			{#each notebooks as notebook (notebook.id)}
				<div
					class="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-paper-ui dark:hover:bg-dark-paper-ui"
				>
					<div class="min-w-0">
						<p class="truncate font-sans text-sm font-medium text-ink dark:text-dark-ink">
							{notebook.filename}
						</p>
						<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
							{formatSize(notebook.size)}{notebook.languageName
								? ` · ${notebook.languageName}`
								: ''}
						</p>
					</div>
					<button
						onclick={() => deleteNotebook(notebook.id)}
						class="ml-3 shrink-0 font-sans text-xs text-ink-faint transition-colors hover:text-red-600 dark:text-dark-ink-faint dark:hover:text-red-400"
					>
						Delete
					</button>
				</div>
			{/each}
		</div>
	{/if}
</div>

{#if showJupyterModal}
	<JupyterImportModal
		projectId={data.project.id}
		onimported={async () => {
			const res = await fetch(`/api/projects/${data.project.id}/notebooks`);
			if (res.ok) notebooks = await res.json();
		}}
		onclose={() => (showJupyterModal = false)}
	/>
{/if}
