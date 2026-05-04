<script lang="ts">
	import TutorialManager from './TutorialManager.svelte';
	import { bibTutorialSteps } from '$lib/tutorials/bib';

	interface Props {
		completed?: boolean;
	}

	let { completed = false }: Props = $props();

	const mockRefs = [
		{
			id: '1',
			title: 'The Paris Agreement: A New Beginning',
			authors: 'Falkner, Robert (2016)',
			journal: 'Global Policy',
			citeKey: 'falkner2016',
			type: 'Article',
			project: 'Climate Policy Review'
		},
		{
			id: '2',
			title: 'Carbon Pricing and the Clean Energy Transition',
			authors: 'Stiglitz, Joseph; Stern, Nicholas (2017)',
			journal: 'Nature Climate Change',
			citeKey: 'stiglitz2017',
			type: 'Article',
			project: 'Climate Policy Review'
		},
		{
			id: '3',
			title: 'Discourse Analysis in Social Media',
			authors: 'Herring, Susan (2020)',
			journal: 'Journal of Linguistics',
			citeKey: 'herring2020',
			type: 'Article',
			project: 'Discourse Analysis'
		}
	];
</script>

<div class="min-h-screen bg-paper-ui dark:bg-dark-paper-ui">
	<div class="mx-auto max-w-4xl px-6 py-8">
		<div class="mb-6 flex items-start justify-between gap-4">
			<div>
				<h1
					data-tutorial="bib-title"
					class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink"
				>
					Global bibliography
				</h1>
				<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
					{mockRefs.length} references across all your projects
				</p>
			</div>
			<button
				data-tutorial="bib-import"
				class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted"
			>
				Import .bib
			</button>
		</div>

		<div class="mb-6">
			<input
				data-tutorial="bib-search"
				type="search"
				placeholder="Search by title, author, key, project…"
				class="w-full rounded-lg border border-paper-border bg-paper px-4 py-2.5 font-sans text-sm text-ink outline-none focus:border-accent dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
			/>
		</div>

		<div class="space-y-8">
			{#each [{ project: 'Climate Policy Review', refs: mockRefs.slice(0, 2) }, { project: 'Discourse Analysis', refs: mockRefs.slice(2) }] as group (group.project)}
				<section>
					<div class="mb-3 flex items-center justify-between">
						<h2
							class="font-sans text-xs font-semibold tracking-wider text-ink-muted uppercase dark:text-dark-ink-muted"
						>
							{group.project}
						</h2>
					</div>
					<div
						class="divide-y divide-paper-border rounded-lg border border-paper-border dark:divide-dark-paper-border dark:border-dark-paper-border"
					>
						{#each group.refs as ref (ref.id)}
							<div class="px-4 py-3">
								<div class="flex items-start justify-between gap-3">
									<div class="min-w-0 flex-1">
										<p class="font-sans text-sm font-medium text-ink dark:text-dark-ink">
											{ref.title}
										</p>
										<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
											{ref.authors}
										</p>
										<p
											class="mt-0.5 font-sans text-xs text-ink-faint italic dark:text-dark-ink-faint"
										>
											{ref.journal}
										</p>
									</div>
									<div class="flex shrink-0 items-center gap-2">
										<span
											class="rounded-full bg-paper-ui px-2 py-0.5 font-sans text-[10px] text-ink-muted dark:bg-dark-paper-ui"
										>
											{ref.type}
										</span>
										<code class="font-mono text-[11px] text-accent">@{ref.citeKey}</code>
									</div>
								</div>
							</div>
						{/each}
					</div>
				</section>
			{/each}
		</div>

		{#if completed}
			<p class="mt-8 font-sans text-sm text-ink-muted italic dark:text-dark-ink-muted">
				Tutorial already completed — the tour will not launch.
			</p>
		{/if}
	</div>

	<TutorialManager
		slug="bib"
		completedTutorials={completed ? ['bib'] : []}
		steps={bibTutorialSteps}
	/>
</div>
