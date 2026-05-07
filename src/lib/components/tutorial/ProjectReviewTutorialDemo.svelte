<script lang="ts">
	import TutorialManager from './TutorialManager.svelte';
	import { projectReviewTutorialSteps } from '$lib/tutorials/projectReview';

	interface Props {
		completed?: boolean;
	}

	let { completed = false }: Props = $props();

	const mockThreads = [
		{
			id: '1',
			documentTitle: 'Literature Review',
			documentId: 'doc-1',
			anchorText: 'carbon pricing mechanisms',
			anchorContext: 'Recent studies on carbon pricing mechanisms suggest a threshold effect.',
			author: 'Ana García',
			date: 'May 2, 14:30',
			content:
				'Could we add the Stern (2022) review here? It directly addresses threshold effects.',
			replies: [
				{
					author: 'Miguel',
					date: 'May 3, 09:15',
					content: "Good call, I'll add it in the next revision."
				}
			]
		},
		{
			id: '2',
			documentTitle: 'Methodology',
			documentId: 'doc-2',
			anchorText: null,
			anchorContext: null,
			author: 'Carlos Ruiz',
			date: 'May 1, 11:00',
			content: 'The sample size justification in section 3.2 needs to be expanded.',
			replies: []
		}
	];
</script>

<div class="min-h-screen bg-paper-ui dark:bg-dark-paper-ui">
	<div class="mx-auto max-w-3xl px-6 py-8">
		<!-- Header -->
		<div class="mb-8">
			<!-- svelte-ignore a11y_invalid_attribute -->
			<a href="#" class="mb-3 flex items-center gap-1.5 font-sans text-sm text-ink-muted">
				← Climate Policy Review
			</a>
			<h1
				data-tutorial="project-review-title"
				class="font-serif text-3xl font-semibold text-ink dark:text-dark-ink"
			>
				Open comments
			</h1>
			<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				{mockThreads.length} open threads across 2 documents
			</p>
		</div>

		<!-- Thread list -->
		<div class="flex flex-col gap-8">
			{#each mockThreads as thread (thread.id)}
				<section>
					<div class="mb-3 flex items-center gap-2">
						<!-- svelte-ignore a11y_invalid_attribute -->
						<a
							href="#"
							class="font-serif text-lg font-semibold text-ink hover:text-accent dark:text-dark-ink"
						>
							{thread.documentTitle}
						</a>
					</div>

					<div
						data-tutorial="project-review-thread"
						class="rounded-xl border border-paper-border bg-paper p-4 dark:border-dark-paper-border dark:bg-dark-paper"
					>
						{#if thread.anchorContext && thread.anchorText}
							<p
								class="mb-2 rounded-md border-l-2 border-amber-300 bg-paper-ui px-2.5 py-1.5 font-sans text-xs leading-relaxed text-ink dark:border-amber-600 dark:bg-dark-paper-ui dark:text-dark-ink"
							>
								{thread.anchorContext}
							</p>
						{/if}

						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0 flex-1">
								<div class="mb-0.5 flex items-center gap-2">
									<span class="font-sans text-xs font-medium text-ink dark:text-dark-ink"
										>{thread.author}</span
									>
									<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint"
										>{thread.date}</span
									>
								</div>
								<p class="font-sans text-sm leading-relaxed text-ink dark:text-dark-ink">
									{thread.content}
								</p>
							</div>

							<div class="flex shrink-0 items-center gap-1.5">
								<button
									data-tutorial="project-review-resolve"
									type="button"
									class="rounded-md border border-paper-border px-2.5 py-1 font-sans text-xs text-ink-muted transition-colors hover:border-green-300 hover:bg-green-50 hover:text-green-700 dark:border-dark-paper-border dark:text-dark-ink-muted"
								>
									Resolve
								</button>
							</div>
						</div>

						{#if thread.replies.length > 0}
							<div
								class="mt-3 flex flex-col gap-2 border-l-2 border-paper-border pl-3 dark:border-dark-paper-border"
							>
								{#each thread.replies as reply (reply.author)}
									<div>
										<div class="mb-0.5 flex items-center gap-2">
											<span class="font-sans text-xs font-medium text-ink dark:text-dark-ink"
												>{reply.author}</span
											>
											<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint"
												>{reply.date}</span
											>
										</div>
										<p class="font-sans text-sm leading-relaxed text-ink dark:text-dark-ink">
											{reply.content}
										</p>
									</div>
								{/each}
							</div>
						{/if}
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
		slug="project-review"
		completedTutorials={completed ? ['project-review'] : []}
		steps={projectReviewTutorialSteps}
	/>
</div>
