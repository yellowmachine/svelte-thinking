<script lang="ts">
	import TutorialManager from './TutorialManager.svelte';
	import { exploreTutorialSteps } from '$lib/tutorials/explore';

	interface Props {
		completed?: boolean;
	}

	let { completed = false }: Props = $props();

	let tab = $state<'projects' | 'researchers'>('projects');

	const mockProjects = [
		{
			id: '1',
			title: 'Climate Policy and Carbon Markets',
			description: 'Analysing the effectiveness of carbon pricing mechanisms in the EU.',
			ownerName: 'Ana García',
			ownerInstitution: 'Universidad Complutense de Madrid',
			isPinned: false
		},
		{
			id: '2',
			title: 'Biodiversity Loss in Urban Ecosystems',
			description: 'Field study on species decline in rapidly urbanising regions.',
			ownerName: 'James Okafor',
			ownerInstitution: 'UCL',
			isPinned: true
		}
	];
</script>

<div class="min-h-screen bg-paper-ui dark:bg-dark-paper-ui">
	<div class="mx-auto max-w-3xl px-6 py-10">
		<h1
			data-tutorial="explore-title"
			class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink"
		>
			Explore
		</h1>
		<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Discover academic projects and collaborators.
		</p>

		<!-- Tabs -->
		<div
			data-tutorial="explore-tabs"
			class="mt-6 flex gap-1 border-b border-paper-border dark:border-dark-paper-border"
		>
			<button
				onclick={() => (tab = 'projects')}
				class="px-4 py-2 font-sans text-sm font-medium transition-colors {tab === 'projects'
					? 'border-b-2 border-accent text-accent'
					: 'text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink'}"
			>
				Projects
			</button>
			<button
				onclick={() => (tab = 'researchers')}
				class="px-4 py-2 font-sans text-sm font-medium transition-colors {tab === 'researchers'
					? 'border-b-2 border-accent text-accent'
					: 'text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink'}"
			>
				Researchers
			</button>
		</div>

		<!-- Search bar -->
		<div data-tutorial="explore-search" class="mt-5 flex gap-2">
			<input
				type="search"
				value="carbon pricing"
				placeholder={tab === 'projects'
					? 'Search projects by topic…'
					: 'Search researchers by specialty…'}
				class="flex-1 rounded-lg border border-paper-border bg-paper px-4 py-2 font-sans text-sm text-ink placeholder-ink-faint focus:ring-2 focus:ring-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink dark:placeholder-dark-ink-faint"
			/>
			<button
				class="rounded-lg bg-accent px-5 py-2 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90"
			>
				Buscar
			</button>
			{#if tab === 'projects'}
				<button
					class="rounded-lg border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted transition-colors hover:border-accent hover:text-accent dark:border-dark-paper-border dark:text-dark-ink-muted"
				>
					Ver todos
				</button>
			{/if}
		</div>

		<!-- Mock results -->
		<div class="mt-8">
			<ul class="flex flex-col gap-4">
				{#each mockProjects as proj (proj.id)}
					<li
						class="rounded-xl border border-paper-border bg-paper p-5 dark:border-dark-paper-border dark:bg-dark-paper"
					>
						<div class="flex items-start justify-between gap-4">
							<div class="min-w-0 flex-1">
								<h2 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">
									{proj.title}
								</h2>
								<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
									{proj.description}
								</p>
								<div class="mt-3 flex items-center gap-2">
									<span
										class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 font-sans text-xs font-semibold text-accent"
									>
										{proj.ownerName.charAt(0)}
									</span>
									<span class="font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
										{proj.ownerName} · {proj.ownerInstitution}
									</span>
								</div>
							</div>
							<button
								class="shrink-0 rounded-lg border px-3 py-1.5 font-sans text-xs font-medium transition-colors {proj.isPinned
									? 'border-accent bg-accent/10 text-accent'
									: 'border-paper-border text-ink-muted hover:border-accent hover:text-accent dark:border-dark-paper-border dark:text-dark-ink-muted'}"
							>
								{proj.isPinned ? '★ Saved' : '☆ Save'}
							</button>
						</div>
					</li>
				{/each}
			</ul>
		</div>

		{#if completed}
			<p class="mt-8 font-sans text-sm text-ink-muted italic dark:text-dark-ink-muted">
				Tutorial already completed — the tour will not launch.
			</p>
		{/if}
	</div>

	<TutorialManager
		slug="explore"
		completedTutorials={completed ? ['explore'] : []}
		steps={exploreTutorialSteps}
	/>
</div>
