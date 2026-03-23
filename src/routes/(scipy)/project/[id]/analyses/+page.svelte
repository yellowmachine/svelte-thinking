<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const statusColors = {
		completed: 'text-green-600 dark:text-green-400',
		failed: 'text-red-500 dark:text-red-400',
		running: 'text-yellow-500 dark:text-yellow-400',
		pending: 'text-ink-faint dark:text-dark-ink-faint'
	};

	function formatDate(date: Date | string) {
		return new Date(date).toLocaleDateString('en-GB', {
			day: 'numeric', month: 'short', year: 'numeric'
		});
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
			<h1 class="mt-1 text-2xl font-semibold text-ink dark:text-dark-ink">Analyses</h1>
		</div>

		<a
			href="/project/{data.project.id}/analyses/new"
			class="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper hover:opacity-90 dark:bg-dark-ink dark:text-dark-paper"
		>
			New analysis
		</a>
	</div>

	<div class="mt-6">
		{#if data.analyses.length === 0}
			<p class="text-sm text-ink-faint dark:text-dark-ink-faint">
				No analyses yet. Run your first analysis to get started.
			</p>
		{:else}
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-paper-border text-left text-ink-faint dark:border-dark-paper-border dark:text-dark-ink-faint">
						<th class="pb-2 font-medium">Type</th>
						<th class="pb-2 font-medium">Status</th>
						<th class="pb-2 font-medium">Date</th>
						<th class="pb-2"></th>
					</tr>
				</thead>
				<tbody>
					{#each data.analyses as analysis (analysis.id)}
						<tr class="border-b border-paper-border dark:border-dark-paper-border">
							<td class="py-3 font-mono text-ink dark:text-dark-ink">{analysis.type}</td>
							<td class="py-3 {statusColors[analysis.status]}">{analysis.status}</td>
							<td class="py-3 text-ink-faint dark:text-dark-ink-faint">{formatDate(analysis.createdAt)}</td>
							<td class="py-3 text-right">
								{#if analysis.status === 'completed'}
									<a
										href="/project/{data.project.id}/analyses/{analysis.id}"
										class="text-xs text-ink-faint underline decoration-dotted hover:text-ink dark:text-dark-ink-faint dark:hover:text-dark-ink"
									>
										View
									</a>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>
</div>
