<script lang="ts">
	import TutorialManager from './TutorialManager.svelte';
	import { projectIssuesTutorialSteps } from '$lib/tutorials/projectIssues';

	interface Props {
		completed?: boolean;
	}

	let { completed = false }: Props = $props();

	const mockIssues = [
		{
			id: '1',
			title: 'Add missing citations in section 3',
			status: 'open',
			priority: 'high',
			date: '1 May 2026'
		},
		{
			id: '2',
			title: 'Review statistical analysis methodology',
			status: 'in_progress',
			priority: 'critical',
			date: '28 Apr 2026'
		},
		{
			id: '3',
			title: 'Update abstract to reflect new findings',
			status: 'open',
			priority: 'medium',
			date: '25 Apr 2026'
		},
		{
			id: '4',
			title: 'Fix bibliography formatting',
			status: 'closed',
			priority: 'low',
			date: '20 Apr 2026'
		}
	];

	let statusFilter = $state<'all' | 'open' | 'in_progress' | 'closed'>('all');

	const filtered = $derived(
		statusFilter === 'all' ? mockIssues : mockIssues.filter((i) => i.status === statusFilter)
	);

	const STATUS_LABEL: Record<string, string> = {
		open: 'Open',
		in_progress: 'In progress',
		closed: 'Closed'
	};

	const STATUS_CLASS: Record<string, string> = {
		open: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
		in_progress: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
		closed: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
	};

	const PRIORITY_CLASS: Record<string, string> = {
		low: 'text-zinc-400 dark:text-zinc-500',
		medium: 'text-sky-500 dark:text-sky-400',
		high: 'text-orange-500 dark:text-orange-400',
		critical: 'text-red-600 dark:text-red-400'
	};
</script>

<div class="min-h-screen bg-paper-ui dark:bg-dark-paper-ui">
	<div class="mx-auto max-w-3xl px-4 py-8">
		<!-- Header -->
		<div class="mb-6 flex items-center justify-between gap-4">
			<div>
				<a href="#" class="font-sans text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400">
					← Climate Policy Review
				</a>
				<h1
					data-tutorial="project-issues-title"
					class="mt-1 font-sans text-xl font-semibold text-zinc-900 dark:text-zinc-100"
				>
					Issues
				</h1>
			</div>
			<button
				data-tutorial="project-issues-new"
				type="button"
				class="rounded-md bg-zinc-900 px-3 py-1.5 font-sans text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
			>
				New issue
			</button>
		</div>

		<!-- Status tabs -->
		<div
			data-tutorial="project-issues-tabs"
			class="mb-4 flex gap-1 border-b border-zinc-200 dark:border-zinc-700"
		>
			{#each [['all', 'All'], ['open', 'Open'], ['in_progress', 'In progress'], ['closed', 'Closed']] as const as [val, label] (val)}
				<button
					type="button"
					onclick={() => {
						statusFilter = val;
					}}
					class="px-3 py-2 font-sans text-sm transition-colors {statusFilter === val
						? 'border-b-2 border-zinc-900 font-medium text-zinc-900 dark:border-zinc-100 dark:text-zinc-100'
						: 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'}"
				>
					{label}
				</button>
			{/each}
		</div>

		<!-- Issue list -->
		<ul class="divide-y divide-zinc-100 dark:divide-zinc-800">
			{#each filtered as iss (iss.id)}
				<li>
					<a
						href="#"
						class="-mx-2 flex items-start gap-3 rounded-md px-2 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
					>
						<span
							class="mt-0.5 shrink-0 rounded-full px-2 py-0.5 font-sans text-xs font-medium {STATUS_CLASS[
								iss.status
							]}"
						>
							{STATUS_LABEL[iss.status]}
						</span>
						<div class="min-w-0 flex-1">
							<p class="truncate font-sans text-sm font-medium text-zinc-900 dark:text-zinc-100">
								{iss.title}
							</p>
							<p class="mt-0.5 font-sans text-xs text-zinc-400 dark:text-zinc-500">{iss.date}</p>
						</div>
						<span
							class="mt-1 shrink-0 font-sans text-xs font-semibold tracking-wide uppercase {PRIORITY_CLASS[
								iss.priority
							]}"
						>
							{iss.priority}
						</span>
					</a>
				</li>
			{/each}
		</ul>

		{#if completed}
			<p class="mt-8 font-sans text-sm text-ink-muted italic dark:text-dark-ink-muted">
				Tutorial already completed — the tour will not launch.
			</p>
		{/if}
	</div>

	<TutorialManager
		slug="project-issues"
		completedTutorials={completed ? ['project-issues'] : []}
		steps={projectIssuesTutorialSteps}
	/>
</div>
