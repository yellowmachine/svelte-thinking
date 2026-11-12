<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let uploading = $state(false);
	let uploadError = $state('');
	let copiedId = $state<string | null>(null);

	function formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	function formatDate(date: Date | string): string {
		return new Date(date).toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	async function upload(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		uploading = true;
		uploadError = '';
		const form = new FormData();
		form.append('file', file);

		try {
			const res = await fetch(`/api/projects/${data.project.id}/datasets`, {
				method: 'POST',
				body: form
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.message ?? 'Upload failed');
			}
			await invalidateAll();
		} catch (err) {
			uploadError = err instanceof Error ? err.message : 'Upload failed';
		} finally {
			uploading = false;
			input.value = '';
		}
	}

	async function remove(datasetId: string) {
		const res = await fetch(
			`/api/projects/${data.project.id}/datasets?datasetId=${encodeURIComponent(datasetId)}`,
			{ method: 'DELETE' }
		);
		if (res.ok) await invalidateAll();
		else uploadError = 'Could not delete the dataset';
	}

	async function copyRef(id: string, filename: string) {
		await navigator.clipboard.writeText(`"data": { "$ref": "dataset:${filename}" }`);
		copiedId = id;
		setTimeout(() => {
			if (copiedId === id) copiedId = null;
		}, 1500);
	}
</script>

<div class="mx-auto max-w-5xl px-6 py-8">
	<div class="mb-8">
		<a
			href={resolve(`/projects/${data.project.id}`)}
			class="mb-4 flex w-fit items-center gap-1.5 font-sans text-sm text-ink-muted transition-colors hover:text-ink"
		>
			<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
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

		<div class="flex flex-wrap items-center justify-between gap-4">
			<div>
				<h1 class="font-serif text-3xl font-semibold text-ink">Datasets</h1>
				<p class="mt-1 font-sans text-sm text-ink-muted">
					CSV, TSV or JSON files (up to 5 MB) for the Vega-Lite charts in your documents.
				</p>
			</div>
			<label
				class="flex cursor-pointer items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 font-sans text-sm font-semibold text-white transition-colors hover:bg-accent-hover {uploading
					? 'pointer-events-none opacity-50'
					: ''}"
			>
				{uploading ? 'Uploading…' : 'Upload file'}
				<input
					type="file"
					class="sr-only"
					accept=".csv,.tsv,.json"
					disabled={uploading}
					onchange={upload}
				/>
			</label>
		</div>
	</div>

	{#if uploadError}
		<p
			role="alert"
			class="mb-4 rounded-lg border border-danger-border bg-danger-bg px-4 py-2 font-sans text-sm text-danger"
		>
			{uploadError}
		</p>
	{/if}

	{#if data.datasets.length === 0}
		<div class="rounded-xl border border-dashed border-paper-border p-12 text-center">
			<p class="font-sans text-sm text-ink-muted">
				No datasets yet. Upload a file, then use it in a chart:
			</p>
			<pre
				class="mx-auto mt-3 w-fit rounded bg-paper-ui px-3 py-2 text-left font-mono text-xs text-ink">```vega-lite
&#123; "data": &#123; "$ref": "dataset:results.csv" &#125;, … &#125;
```</pre>
		</div>
	{:else}
		<ul class="flex flex-col gap-1 rounded-xl border border-paper-border bg-paper p-2">
			{#each data.datasets as dataset (dataset.id)}
				<li class="flex items-center justify-between gap-3 rounded-lg px-3 py-2 hover:bg-paper-ui">
					<div class="min-w-0">
						<p class="truncate font-mono text-sm text-ink">{dataset.filename}</p>
						<p class="font-sans text-xs text-ink-muted">
							{formatSize(dataset.size)} · {formatDate(dataset.createdAt)}
						</p>
					</div>
					<div class="flex shrink-0 items-center gap-3">
						<button
							onclick={() => copyRef(dataset.id, dataset.filename)}
							class="font-sans text-xs text-ink-muted transition-colors hover:text-accent-ink"
						>
							{copiedId === dataset.id ? 'Copied' : 'Copy chart reference'}
						</button>
						{#if dataset.uploadedBy === data.userId}
							<button
								onclick={() => remove(dataset.id)}
								class="font-sans text-xs text-ink-muted transition-colors hover:text-danger"
							>
								Delete
							</button>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>
