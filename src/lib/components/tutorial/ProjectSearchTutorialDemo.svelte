<script lang="ts">
	import TutorialManager from './TutorialManager.svelte';
	import { projectSearchTutorialSteps } from '$lib/tutorials/projectSearch';

	interface Props {
		completed?: boolean;
	}

	let { completed = false }: Props = $props();

	const mockResults = [
		{
			id: '1',
			title: 'Literature Review',
			text: 'Carbon pricing mechanisms have been shown to reduce emissions when implemented with sufficiently high price floors...',
			similarity: 0.91
		},
		{
			id: '2',
			title: 'Policy Analysis',
			text: 'The effectiveness of market-based instruments, including carbon taxes and cap-and-trade schemes, depends heavily on...',
			similarity: 0.78
		},
		{
			id: '3',
			title: 'Conclusion',
			text: 'Integrating carbon pricing with complementary policies can accelerate the clean energy transition significantly...',
			similarity: 0.65
		}
	];
</script>

<div class="min-h-screen bg-paper-ui">
	<div class="mx-auto max-w-2xl px-4 py-10">
		<!-- svelte-ignore a11y_invalid_attribute -->
		<a href="#" class="mb-6 inline-flex items-center gap-1.5 font-sans text-sm text-ink-faint">
			← Climate Policy Review
		</a>

		<form class="mb-8">
			<div data-tutorial="project-search-input" class="relative">
				<svg
					width="15"
					height="15"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint"
					aria-hidden="true"
				>
					<circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
				</svg>
				<input
					type="search"
					value="carbon pricing"
					placeholder="Search in this project…"
					class="w-full rounded-xl border border-paper-border bg-paper py-2.5 pr-4 pl-9 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
				/>
			</div>
		</form>

		<p class="mb-4 font-sans text-xs text-ink-faint">
			{mockResults.length} documents matching
			<span class="font-medium text-ink">"carbon pricing"</span>
		</p>

		<ul data-tutorial="project-search-results" class="flex flex-col gap-3">
			{#each mockResults as result (result.id)}
				<li>
					<!-- svelte-ignore a11y_invalid_attribute -->
					<a
						href="#"
						class="block rounded-xl border border-paper-border bg-paper p-4 transition-colors hover:border-accent/40 hover:bg-paper-ui dark:hover:border-accent/40"
					>
						<p class="mb-1.5 font-sans text-sm font-medium text-ink">
							{result.title}
						</p>
						<p class="line-clamp-3 font-sans text-xs leading-relaxed text-ink-muted">
							{result.text}
						</p>
						<p class="mt-2 font-sans text-xs text-ink-faint">
							{Math.round(result.similarity * 100)}% match
						</p>
					</a>
				</li>
			{/each}
		</ul>

		{#if completed}
			<p class="mt-8 font-sans text-sm text-ink-muted italic">
				Tutorial already completed — the tour will not launch.
			</p>
		{/if}
	</div>

	<TutorialManager
		slug="project-search"
		completedTutorials={completed ? ['project-search'] : []}
		steps={projectSearchTutorialSteps}
	/>
</div>
