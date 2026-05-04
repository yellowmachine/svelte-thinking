<script lang="ts">
	import TutorialManager from './TutorialManager.svelte';
	import { documentTutorialSteps } from '$lib/tutorials/document';

	interface Props {
		completed?: boolean;
	}

	let { completed = false }: Props = $props();
</script>

<div class="flex h-screen flex-col bg-paper dark:bg-dark-paper">
	<!-- Sticky toolbar -->
	<div
		class="sticky top-0 z-10 flex flex-col border-b border-paper-border bg-paper/95 dark:border-dark-paper-border dark:bg-dark-paper/95"
	>
		<!-- Row 1: breadcrumb -->
		<div
			data-tutorial="doc-breadcrumb"
			class="flex min-w-0 items-center gap-2 border-b border-paper-border/50 px-6 py-2 font-sans text-sm dark:border-dark-paper-border/50"
		>
			<button class="shrink-0 text-ink-muted dark:text-dark-ink-muted">Climate Policy Review</button
			>
			<span class="text-ink-faint dark:text-dark-ink-faint">/</span>
			<span class="truncate font-medium text-ink dark:text-dark-ink"
				>Introduction to Climate Policy</span
			>
			<span class="ml-auto shrink-0 font-sans text-xs text-green-600">Saved</span>
		</div>

		<!-- Row 2: toolbar -->
		<div data-tutorial="doc-toolbar" class="flex items-center gap-2 overflow-x-auto px-4 py-2">
			<button
				class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted"
				>Save</button
			>
			<button
				class="flex items-center gap-1.5 rounded-md bg-accent/10 px-3 py-1.5 font-sans text-sm font-medium text-accent"
				>Assistant</button
			>
			<button
				class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted"
				>Review</button
			>
			<button
				class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted"
				>Comments</button
			>
			<button
				class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted"
				>Bib</button
			>
			<button
				class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted"
				>History</button
			>
			<button
				class="ml-auto rounded-md bg-accent px-3 py-1.5 font-sans text-sm font-medium text-white"
				>Commit</button
			>
		</div>
	</div>

	<!-- Main editor area -->
	<div data-tutorial="doc-editor-area" class="flex flex-1 overflow-hidden">
		<div class="flex-1 overflow-y-auto px-6 py-10">
			<div class="mx-auto w-full max-w-2xl">
				<h1 class="mb-6 font-serif text-3xl font-semibold text-ink dark:text-dark-ink">
					Introduction to Climate Policy
				</h1>
				<div class="prose max-w-none font-serif text-ink prose-stone dark:text-dark-ink">
					<p class="mb-4 leading-relaxed">
						Climate policy encompasses the set of regulatory and economic measures governments adopt
						to address climate change. The Paris Agreement (2015) established a framework for
						internationally coordinated action [[@paris2015]].
					</p>
					<p class="mb-4 leading-relaxed text-ink-faint dark:text-dark-ink-faint">
						## Key Mechanisms<br />
						Carbon pricing, renewable energy subsidies, and efficiency standards represent the three main
						policy instruments available to governments.
					</p>
				</div>
			</div>
		</div>
	</div>

	{#if completed}
		<div
			class="border-t border-paper-border bg-paper px-6 py-2 font-sans text-sm text-ink-muted italic dark:border-dark-paper-border dark:text-dark-ink-muted"
		>
			Tutorial already completed — the tour will not launch.
		</div>
	{/if}
</div>

<TutorialManager
	slug="document"
	completedTutorials={completed ? ['document'] : []}
	steps={documentTutorialSteps}
/>
