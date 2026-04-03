<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const { analysis } = data;
	const result = analysis.result as Record<string, unknown> | null;
	const params = analysis.parameters as Record<string, unknown>;

	function fmt(val: unknown): string {
		if (val === null || val === undefined) return '—';
		if (typeof val === 'number') return Number.isInteger(val) ? String(val) : val.toFixed(4);
		return String(val);
	}
</script>

<div class="p-8 max-w-2xl">
	<div>
		<a
			href="/project/{data.project.id}/analyses"
			class="text-sm text-ink-faint hover:text-ink dark:text-dark-ink-faint dark:hover:text-dark-ink"
		>
			← Analyses
		</a>
		<h1 class="mt-1 text-2xl font-semibold text-ink dark:text-dark-ink capitalize">
			{analysis.type}
		</h1>
		<p class="mt-1 text-sm text-ink-faint dark:text-dark-ink-faint">
			{data.datasetFilename}
		</p>
	</div>

	{#if analysis.status === 'failed'}
		<div class="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
			<p class="text-sm font-medium text-red-700 dark:text-red-300">Analysis failed</p>
			<p class="mt-1 text-sm text-red-600 dark:text-red-400">{analysis.errorMessage}</p>
		</div>

	{:else if analysis.type === 'describe' && result}
		<div class="mt-6 overflow-x-auto">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-paper-border text-left text-ink-faint dark:border-dark-paper-border dark:text-dark-ink-faint">
						<th class="pb-2 pr-4 font-medium">Stat</th>
						{#each Object.keys(result.data as object) as col}
							<th class="pb-2 pr-4 font-medium font-mono">{col}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each ['count', 'mean', 'std', 'min', '25%', '50%', '75%', 'max'] as stat}
						<tr class="border-b border-paper-border dark:border-dark-paper-border">
							<td class="py-2 pr-4 text-ink-faint dark:text-dark-ink-faint">{stat}</td>
							{#each Object.values(result.data as Record<string, Record<string, number>>) as col}
								<td class="py-2 pr-4 font-mono text-ink dark:text-dark-ink">{fmt(col[stat])}</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

	{:else if analysis.type === 'ttest' && result}
		{@const d = result.data as Record<string, unknown>}
		<div class="mt-6 space-y-3">
			<div class="rounded-lg border border-paper-border p-4 dark:border-dark-paper-border">
				<p class="text-sm text-ink dark:text-dark-ink">{fmt(d.interpretation)}</p>
			</div>
			<table class="w-full text-sm">
				<tbody>
					{#each [['Statistic', d.statistic], ['p-value', d.p_value], ['Degrees of freedom', d.degrees_of_freedom], ["Cohen's d", d.cohens_d], ['CI low', (d.confidence_interval as number[])?.[0]], ['CI high', (d.confidence_interval as number[])?.[1]]] as [label, val]}
						<tr class="border-b border-paper-border dark:border-dark-paper-border">
							<td class="py-2 text-ink-faint dark:text-dark-ink-faint">{label}</td>
							<td class="py-2 font-mono text-ink dark:text-dark-ink">{fmt(val)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
			<p class="text-sm text-ink-faint dark:text-dark-ink-faint">
				Reject H₀: <span class="font-medium text-ink dark:text-dark-ink">{d.reject_null ? 'Yes' : 'No'}</span>
				· α = {fmt(params.alpha)}
				· {fmt(params.alternative)}
			</p>
		</div>
	{/if}
</div>
