<script lang="ts">
	import { goto } from '$app/navigation';
	import { trpc } from '$lib/utils/trpc';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const sample = $derived(data.sample);

	// The first doc is the one shown as the example in the help page
	const exampleDoc = $derived(sample.docs[0]);

	let creating = $state(false);
	let errorMsg = $state('');

	async function createSampleProject() {
		creating = true;
		errorMsg = '';
		try {
			const { projectId } = await trpc.projects.createFromSample.mutate(sample.slug);
			await goto(`/projects/${projectId}`);
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Something went wrong';
			creating = false;
		}
	}
</script>

<svelte:head>
	<title>{sample.label} — Scholio Help</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-6 py-10">
	<!-- Breadcrumb -->
	<nav
		class="mb-6 flex items-center gap-2 font-sans text-xs text-ink-faint dark:text-dark-ink-faint"
	>
		<a href="/help" class="text-accent underline-offset-2 hover:underline">Help</a>
		<span>/</span>
		<span>Document types</span>
		<span>/</span>
		<span class="text-ink-muted dark:text-dark-ink-muted">{sample.label}</span>
	</nav>

	<!-- Header -->
	<div class="mb-8">
		<h1 class="font-serif text-3xl font-semibold text-ink dark:text-dark-ink">{sample.label}</h1>
		<p
			class="mt-3 max-w-2xl font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted"
		>
			{sample.description}
		</p>
	</div>

	<!-- What you can do -->
	<section class="mb-8">
		<h2 class="mb-3 font-serif text-base font-semibold text-ink dark:text-dark-ink">
			What you can do
		</h2>
		<ul class="space-y-1.5">
			{#each sample.features as feature, i (i)}
				<li
					class="flex items-start gap-2 font-sans text-sm text-ink-muted dark:text-dark-ink-muted"
				>
					<span class="mt-0.5 shrink-0 text-accent">✓</span>
					<span>{feature}</span>
				</li>
			{/each}
		</ul>
	</section>

	<!-- Example -->
	<section class="mb-8">
		<h2 class="mb-3 font-serif text-base font-semibold text-ink dark:text-dark-ink">
			Example — <span class="font-sans font-normal text-ink-muted dark:text-dark-ink-muted"
				>{exampleDoc.title}</span
			>
		</h2>
		<div
			class="overflow-hidden rounded-xl border border-paper-border dark:border-dark-paper-border"
		>
			<div
				class="flex items-center justify-between border-b border-paper-border bg-paper-ui px-4 py-2 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<span class="font-mono text-[11px] text-ink-faint dark:text-dark-ink-faint">markdown</span>
				<span
					class="rounded bg-paper-border px-2 py-0.5 font-mono text-[10px] text-ink-muted dark:bg-dark-paper-border dark:text-dark-ink-muted"
				>
					type: {exampleDoc.docType}
				</span>
			</div>
			<pre
				class="overflow-x-auto bg-paper px-5 py-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-ink dark:bg-dark-paper dark:text-dark-ink">{exampleDoc.content.trim()}</pre>
		</div>

		{#if sample.docs.length > 1}
			<p class="mt-2 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
				This sample project includes {sample.docs.length} documents. The example above shows the first
				one.
			</p>
		{/if}
	</section>

	<!-- Try it -->
	<section
		class="rounded-xl border border-accent/20 bg-accent/5 px-6 py-5 dark:border-accent/15 dark:bg-accent/10"
	>
		<p class="font-serif text-base font-semibold text-ink dark:text-dark-ink">Try it yourself</p>
		<p class="mt-1 mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Creates a new project called <strong>"{sample.projectTitle}"</strong> in your workspace,
			pre-filled with {sample.docs.length === 1
				? 'this example document'
				: `${sample.docs.length} example documents`}. You can edit or delete it at any time.
		</p>
		<button
			onclick={createSampleProject}
			disabled={creating}
			class="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:pointer-events-none disabled:opacity-50"
		>
			{#if creating}
				<Spinner />
				Creating…
			{:else}
				Create sample project
			{/if}
		</button>
		{#if errorMsg}
			<p class="mt-2 font-sans text-xs text-red-600 dark:text-red-400">{errorMsg}</p>
		{/if}
	</section>
</div>
