<script lang="ts">
	import TutorialManager from './TutorialManager.svelte';
	import { projectTutorialSteps } from '$lib/tutorials/project';

	interface Props {
		completed?: boolean;
	}

	let { completed = false }: Props = $props();
</script>

<div class="min-h-screen bg-paper-ui dark:bg-dark-paper-ui">
	<div class="mx-auto max-w-5xl px-6 py-8">
		<!-- Header -->
		<button
			class="mb-4 flex items-center gap-1.5 font-sans text-sm text-ink-muted dark:text-dark-ink-muted"
		>
			← Projects
		</button>
		<div class="mb-8 flex items-start justify-between gap-4">
			<div class="min-w-0 flex-1">
				<button
					data-tutorial="project-title"
					type="button"
					class="block cursor-text text-left font-serif text-3xl font-semibold text-ink hover:opacity-80 dark:text-dark-ink"
				>
					Climate Policy Review
				</button>
				<p class="mt-2 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
					Analysis of international climate agreements and their implementation.
				</p>
			</div>
			<div class="hidden shrink-0 items-center gap-2 sm:flex">
				<a
					href="#"
					class="flex items-center gap-1.5 rounded-md bg-accent/10 px-3 py-1.5 font-sans text-sm font-medium text-accent"
				>
					Assistant
				</a>
				<span
					class="rounded-full bg-paper-border px-3 py-1 font-sans text-xs font-medium text-ink-muted dark:bg-dark-paper-border dark:text-dark-ink-muted"
				>
					Active
				</span>
			</div>
		</div>

		<div class="grid gap-8 lg:grid-cols-3">
			<!-- Documents section -->
			<div data-tutorial="project-docs-section" class="lg:col-span-2">
				<div class="mb-4 flex items-center justify-between">
					<h2 class="font-serif text-xl font-semibold text-ink dark:text-dark-ink">Documents</h2>
					<div class="flex items-center gap-2">
						<button
							class="flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/5 px-3 py-1.5 font-sans text-sm text-accent"
						>
							Generate draft
						</button>
						<button
							data-tutorial="project-new-doc"
							class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted"
						>
							+ New
						</button>
					</div>
				</div>
				<div
					class="flex flex-col gap-1 rounded-xl border border-paper-border bg-paper p-2 dark:border-dark-paper-border dark:bg-dark-paper"
				>
					{#each ['Introduction to Climate Policy', 'Paris Agreement Analysis', 'Chapter 3: Mitigation Strategies'] as title (title)}
						<div class="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-paper-ui">
							<span class="font-sans text-sm text-ink dark:text-dark-ink">{title}</span>
						</div>
					{/each}
				</div>
			</div>

			<!-- Sidebar -->
			<div data-tutorial="project-sidebar" class="space-y-4">
				<div
					class="rounded-xl border border-paper-border bg-paper p-4 dark:border-dark-paper-border dark:bg-dark-paper"
				>
					<h3
						class="mb-3 font-sans text-xs font-semibold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint"
					>
						Collaborators
					</h3>
					<div class="space-y-2">
						<div class="flex items-center gap-2">
							<div class="h-6 w-6 rounded-full bg-accent/20"></div>
							<span class="font-sans text-sm text-ink dark:text-dark-ink">You (Owner)</span>
						</div>
					</div>
				</div>
				<div
					class="rounded-xl border border-paper-border bg-paper p-4 dark:border-dark-paper-border dark:bg-dark-paper"
				>
					<h3
						class="mb-2 font-sans text-xs font-semibold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint"
					>
						Project settings
					</h3>
					<p class="font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
						Citation style: APA · Status: Active
					</p>
				</div>
			</div>
		</div>

		{#if completed}
			<p class="mt-8 font-sans text-sm text-ink-muted italic dark:text-dark-ink-muted">
				Tutorial already completed — the tour will not launch.
			</p>
		{/if}
	</div>

	<TutorialManager
		slug="project"
		completedTutorials={completed ? ['project'] : []}
		steps={projectTutorialSteps}
	/>
</div>
