<script lang="ts">
	import TutorialManager from './TutorialManager.svelte';
	import { projectBibTutorialSteps } from '$lib/tutorials/projectBib';

	interface Props {
		completed?: boolean;
	}

	let { completed = false }: Props = $props();

	const mockRefs = [
		{
			id: '1',
			citeKey: 'falkner2016',
			title: 'The Paris Agreement: A New Beginning',
			authors: 'Falkner, Robert',
			year: '2016',
			journal: 'Global Policy',
			type: 'article'
		},
		{
			id: '2',
			citeKey: 'stiglitz2017',
			title: 'Carbon Pricing and the Clean Energy Transition',
			authors: 'Stiglitz, Joseph; Stern, Nicholas',
			year: '2017',
			journal: 'Nature Climate Change',
			type: 'article'
		}
	];
</script>

<div class="min-h-screen bg-paper-ui dark:bg-dark-paper-ui">
	<div class="mx-auto flex max-w-6xl flex-col px-6 py-8">
		<!-- Header -->
		<div class="mb-6">
			<!-- svelte-ignore a11y_invalid_attribute -->
			<a href="#" class="mb-4 flex items-center gap-1.5 font-sans text-sm text-ink-muted">
				← Climate Policy Review
			</a>
			<div class="flex items-center justify-between gap-4">
				<div>
					<h1
						data-tutorial="project-bib-title"
						class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink"
					>
						Bibliography
					</h1>
					<p class="mt-0.5 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
						{mockRefs.length} references
					</p>
				</div>
				<div class="flex flex-wrap items-center gap-2">
					<button
						class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted"
					>
						Search paper
					</button>
					<button
						data-tutorial="project-bib-doi"
						class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted"
					>
						DOI lookup
					</button>
					<button
						data-tutorial="project-bib-url"
						class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted"
					>
						URL → AI
					</button>
					<button
						data-tutorial="project-bib-import"
						class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted"
					>
						Import .bib
					</button>
					<button
						class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted"
					>
						Link from library
					</button>
					<button
						data-tutorial="project-bib-new"
						class="rounded-md bg-accent px-3 py-1.5 font-sans text-sm font-medium text-white"
					>
						+ New reference
					</button>
				</div>
			</div>
		</div>

		<!-- Reference list -->
		<div
			class="divide-y divide-paper-border rounded-lg border border-paper-border dark:divide-dark-paper-border dark:border-dark-paper-border"
		>
			{#each mockRefs as ref (ref.id)}
				<div class="px-4 py-3">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0 flex-1">
							<p class="font-sans text-sm font-medium text-ink dark:text-dark-ink">{ref.title}</p>
							<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
								{ref.authors} ({ref.year}) · <em>{ref.journal}</em>
							</p>
						</div>
						<code class="shrink-0 font-mono text-[11px] text-accent">@{ref.citeKey}</code>
					</div>
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
		slug="project-bib"
		completedTutorials={completed ? ['project-bib'] : []}
		steps={projectBibTutorialSteps}
	/>
</div>
