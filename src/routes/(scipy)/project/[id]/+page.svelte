<script lang="ts">
	import type { PageData } from './$types';

	import { resolve } from '$app/paths';
	let { data }: { data: PageData } = $props();
</script>

<div class="p-8">
	<h1 class="text-2xl font-semibold text-ink dark:text-dark-ink">{data.project.title}</h1>

	<div class="mt-8 grid gap-4 sm:grid-cols-3">
		<a
			href={resolve(`/project/${data.project.id}/datasets`)}
			class="rounded-lg border border-paper-border p-6 hover:border-ink-faint dark:border-dark-paper-border dark:hover:border-dark-ink-faint"
		>
			<h2 class="font-medium text-ink dark:text-dark-ink">Datasets</h2>
			<p class="mt-1 text-sm text-ink-faint dark:text-dark-ink-faint">
				{data.datasets.length}
				{data.datasets.length === 1 ? 'file' : 'files'} · CSV, TSV, Parquet
			</p>
		</a>

		<a
			href={resolve(`/project/${data.project.id}/analyses`)}
			class="rounded-lg border border-paper-border p-6 hover:border-ink-faint dark:border-dark-paper-border dark:hover:border-dark-ink-faint"
		>
			<h2 class="font-medium text-ink dark:text-dark-ink">Analyses</h2>
			<p class="mt-1 text-sm text-ink-faint dark:text-dark-ink-faint">
				Run and review statistical analyses
			</p>
		</a>

		<a
			href={resolve(`/project/${data.project.id}/templates`)}
			class="rounded-lg border border-paper-border p-6 hover:border-ink-faint dark:border-dark-paper-border dark:hover:border-dark-ink-faint"
		>
			<h2 class="font-medium text-ink dark:text-dark-ink">Templates</h2>
			<p class="mt-1 text-sm text-ink-faint dark:text-dark-ink-faint">
				Reusable analysis configurations
			</p>
		</a>
	</div>
</div>
