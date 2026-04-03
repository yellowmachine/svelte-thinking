<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let uploading = $state(false);
	let uploadError = $state('');

	let datasets = $derived(data.datasets);

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

	async function handleUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		uploading = true;
		uploadError = '';

		const formData = new FormData();
		formData.append('file', file);

		const res = await fetch(`/api/projects/${data.project.id}/datasets`, {
			method: 'POST',
			body: formData
		});

		if (res.ok) {
			await invalidateAll();
		} else {
			const body = await res.json().catch(() => ({}));
			uploadError = body.message ?? 'Upload failed';
		}

		uploading = false;
		input.value = '';
	}

	async function handleDelete(datasetId: string) {
		const res = await fetch(
			`/api/projects/${data.project.id}/datasets?datasetId=${datasetId}`,
			{ method: 'DELETE' }
		);

		if (res.ok) {
			await invalidateAll();
		}
	}
</script>

<div class="p-8">
	<div class="flex items-center justify-between">
		<div>
			<a
				href="/project/{data.project.id}"
				class="text-sm text-ink-faint hover:text-ink dark:text-dark-ink-faint dark:hover:text-dark-ink"
			>
				← {data.project.title}
			</a>
			<h1 class="mt-1 text-2xl font-semibold text-ink dark:text-dark-ink">Datasets</h1>
		</div>

		<label
			class="cursor-pointer rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper hover:opacity-90 dark:bg-dark-ink dark:text-dark-paper"
			class:opacity-50={uploading}
		>
			{uploading ? 'Uploading…' : 'Upload file'}
			<input
				type="file"
				accept=".csv,.tsv,.json,.xls,.xlsx"
				class="hidden"
				disabled={uploading}
				onchange={handleUpload}
			/>
		</label>
	</div>

	{#if uploadError}
		<p class="mt-3 text-sm text-red-600 dark:text-red-400">{uploadError}</p>
	{/if}

	<div class="mt-6">
		{#if datasets.length === 0}
			<p class="text-sm text-ink-faint dark:text-dark-ink-faint">
				No datasets yet. Upload a CSV, TSV, JSON, XLS or XLSX file to get started.
			</p>
		{:else}
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-paper-border text-left text-ink-faint dark:border-dark-paper-border dark:text-dark-ink-faint">
						<th class="pb-2 font-medium">File</th>
						<th class="pb-2 font-medium">Size</th>
						<th class="pb-2 font-medium">Uploaded</th>
						<th class="pb-2"></th>
					</tr>
				</thead>
				<tbody>
					{#each datasets as dataset (dataset.id)}
						<tr class="border-b border-paper-border dark:border-dark-paper-border">
							<td class="py-3 font-mono text-ink dark:text-dark-ink">{dataset.filename}</td>
							<td class="py-3 text-ink-faint dark:text-dark-ink-faint">{formatSize(dataset.size)}</td>
							<td class="py-3 text-ink-faint dark:text-dark-ink-faint">{formatDate(dataset.createdAt)}</td>
							<td class="py-3 text-right">
								{#if dataset.uploadedBy === data.userId}
									<button
										class="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
										onclick={() => handleDelete(dataset.id)}
									>
										Delete
									</button>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>
</div>
