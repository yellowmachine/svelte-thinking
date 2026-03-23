<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const tpl = data.template?.parameters as Record<string, unknown> | undefined;

	let selectedDataset = $state(data.datasets[0]?.id ?? '');
	let selectedType = $state<'describe' | 'ttest'>((data.template?.type as 'describe' | 'ttest') ?? 'describe');
	let running = $state(false);
	let runError = $state('');

	// ttest-specific params — pre-filled from template if present
	let ttestColumnA = $state((tpl?.column_a as string) ?? '');
	let ttestColumnB = $state((tpl?.column_b as string) ?? '');
	let ttestType = $state<'independent' | 'paired' | 'one_sample'>((tpl?.test_type as 'independent' | 'paired' | 'one_sample') ?? 'independent');
	let ttestAlternative = $state<'two-sided' | 'less' | 'greater'>((tpl?.alternative as 'two-sided' | 'less' | 'greater') ?? 'two-sided');
	let ttestAlpha = $state((tpl?.alpha as number) ?? 0.05);

	async function run() {
		running = true;
		runError = '';

		let parameters: Record<string, unknown> = {};
		if (selectedType === 'ttest') {
			parameters = {
				test_type: ttestType,
				column_a: ttestColumnA,
				column_b: ttestColumnB || undefined,
				alternative: ttestAlternative,
				alpha: ttestAlpha
			};
		}

		const res = await fetch(`/api/projects/${data.project.id}/analyses`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ datasetId: selectedDataset, type: selectedType, parameters })
		});

		if (res.ok) {
			const analysis = await res.json();
			goto(`/project/${data.project.id}/analyses/${analysis.id}`);
		} else {
			const body = await res.json().catch(() => ({}));
			runError = body.message ?? 'Analysis failed';
			running = false;
		}
	}
</script>

<div class="p-8 max-w-xl">
	<div>
		<a
			href="/project/{data.project.id}/analyses"
			class="text-sm text-ink-faint hover:text-ink dark:text-dark-ink-faint dark:hover:text-dark-ink"
		>
			← Analyses
		</a>
		<h1 class="mt-1 text-2xl font-semibold text-ink dark:text-dark-ink">New analysis</h1>
	</div>

	<div class="mt-8 space-y-6">
		<!-- Dataset -->
		<div>
			<label class="block text-sm font-medium text-ink dark:text-dark-ink">Dataset</label>
			<select
				bind:value={selectedDataset}
				class="mt-1 w-full rounded-md border border-paper-border bg-paper px-3 py-2 text-sm text-ink dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
			>
				{#each data.datasets as dataset}
					<option value={dataset.id}>{dataset.filename}</option>
				{/each}
			</select>
		</div>

		<!-- Type -->
		<div>
			<label class="block text-sm font-medium text-ink dark:text-dark-ink">Analysis type</label>
			<div class="mt-2 flex gap-3">
				<button
					class="rounded-md border px-4 py-2 text-sm transition-colors"
					class:border-ink={selectedType === 'describe'}
					class:bg-ink={selectedType === 'describe'}
					class:text-paper={selectedType === 'describe'}
					class:border-paper-border={selectedType !== 'describe'}
					class:text-ink-faint={selectedType !== 'describe'}
					onclick={() => (selectedType = 'describe')}
				>
					Descriptive stats
				</button>
				<button
					class="rounded-md border px-4 py-2 text-sm transition-colors"
					class:border-ink={selectedType === 'ttest'}
					class:bg-ink={selectedType === 'ttest'}
					class:text-paper={selectedType === 'ttest'}
					class:border-paper-border={selectedType !== 'ttest'}
					class:text-ink-faint={selectedType !== 'ttest'}
					onclick={() => (selectedType = 'ttest')}
				>
					t-test
				</button>
			</div>
		</div>

		<!-- t-test params -->
		{#if selectedType === 'ttest'}
			<div class="space-y-4 rounded-lg border border-paper-border p-4 dark:border-dark-paper-border">
				<div>
					<label class="block text-sm font-medium text-ink dark:text-dark-ink">Test type</label>
					<select
						bind:value={ttestType}
						class="mt-1 w-full rounded-md border border-paper-border bg-paper px-3 py-2 text-sm text-ink dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
					>
						<option value="independent">Independent samples</option>
						<option value="paired">Paired samples</option>
						<option value="one_sample">One sample</option>
					</select>
				</div>
				<div>
					<label class="block text-sm font-medium text-ink dark:text-dark-ink">Column A</label>
					<input
						type="text"
						bind:value={ttestColumnA}
						placeholder="e.g. control"
						class="mt-1 w-full rounded-md border border-paper-border bg-paper px-3 py-2 text-sm text-ink dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
					/>
				</div>
				{#if ttestType !== 'one_sample'}
					<div>
						<label class="block text-sm font-medium text-ink dark:text-dark-ink">Column B</label>
						<input
							type="text"
							bind:value={ttestColumnB}
							placeholder="e.g. treatment"
							class="mt-1 w-full rounded-md border border-paper-border bg-paper px-3 py-2 text-sm text-ink dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
						/>
					</div>
				{/if}
				<div class="flex gap-4">
					<div class="flex-1">
						<label class="block text-sm font-medium text-ink dark:text-dark-ink">Alternative</label>
						<select
							bind:value={ttestAlternative}
							class="mt-1 w-full rounded-md border border-paper-border bg-paper px-3 py-2 text-sm text-ink dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
						>
							<option value="two-sided">Two-sided</option>
							<option value="less">Less</option>
							<option value="greater">Greater</option>
						</select>
					</div>
					<div class="w-24">
						<label class="block text-sm font-medium text-ink dark:text-dark-ink">α</label>
						<input
							type="number"
							bind:value={ttestAlpha}
							min="0.001" max="0.1" step="0.005"
							class="mt-1 w-full rounded-md border border-paper-border bg-paper px-3 py-2 text-sm text-ink dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
						/>
					</div>
				</div>
			</div>
		{/if}

		{#if runError}
			<p class="text-sm text-red-600 dark:text-red-400">{runError}</p>
		{/if}

		<button
			onclick={run}
			disabled={running}
			class="rounded-md bg-ink px-6 py-2 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-50 dark:bg-dark-ink dark:text-dark-paper"
		>
			{running ? 'Running…' : 'Run analysis'}
		</button>
	</div>
</div>
