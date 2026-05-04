<script lang="ts">
	import TutorialManager from './TutorialManager.svelte';
	import { projectsTutorialSteps } from '$lib/tutorials/projects';

	interface Props {
		completed?: boolean;
	}

	let { completed = false }: Props = $props();
</script>

<div class="min-h-screen bg-paper-ui dark:bg-dark-paper-ui">
	<div class="mx-auto max-w-5xl px-6 py-8">
		<!-- Header -->
		<div class="mb-8 flex items-center justify-between">
			<div>
				<h1
					data-tutorial="projects-title"
					class="font-serif text-3xl font-semibold text-ink dark:text-dark-ink"
				>
					My projects
				</h1>
				<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">3 projects</p>
			</div>
			<div class="flex items-center gap-2">
				<button
					data-tutorial="import-btn"
					class="rounded-md border border-paper-border px-4 py-2 font-sans text-sm font-medium text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
				>
					Import
				</button>
				<button
					data-tutorial="new-project-btn"
					class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover"
				>
					New project
				</button>
			</div>
		</div>

		<!-- Mock project cards -->
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each ['Discourse Analysis', 'Climate Policy Review', 'Urban Mobility Study'] as title (title)}
				<div
					class="rounded-xl border border-paper-border bg-paper p-5 dark:border-dark-paper-border dark:bg-dark-paper"
				>
					<h3 class="font-serif font-medium text-ink dark:text-dark-ink">{title}</h3>
					<p class="mt-1 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
						Updated 2 days ago
					</p>
				</div>
			{/each}
		</div>

		{#if completed}
			<p class="mt-8 font-sans text-sm text-ink-muted italic dark:text-dark-ink-muted">
				Tutorial already completed — the tour will not launch.
			</p>
		{/if}
	</div>

	<TutorialManager
		slug="projects"
		completedTutorials={completed ? ['projects'] : []}
		steps={projectsTutorialSteps}
	/>
</div>
