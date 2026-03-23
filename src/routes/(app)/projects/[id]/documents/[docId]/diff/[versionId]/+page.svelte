<script lang="ts">
	import DiffViewer from '$lib/components/editor/DiffViewer.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Diff v{data.current.versionNumber} — {data.documentTitle}</title>
</svelte:head>

<div class="min-h-screen bg-paper px-6 py-8 dark:bg-dark-paper">
	<div class="mx-auto max-w-5xl">
		<div class="mb-6 flex items-center gap-3">
			<button
				onclick={() => history.back()}
				class="font-sans text-sm text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
			>
				← Volver
			</button>
			<span class="text-ink-faint dark:text-dark-ink-faint">/</span>
			<h1 class="font-serif text-lg font-semibold text-ink dark:text-dark-ink">
				{data.documentTitle} — v{data.current.versionNumber}
			</h1>
			{#if data.current.changeDescription}
				<span class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
					"{data.current.changeDescription}"
				</span>
			{/if}
		</div>

		<DiffViewer
			oldText={data.previous?.content ?? ''}
			newText={data.current.content}
			oldLabel={data.previous ? `v${data.previous.versionNumber}` : '(vacío)'}
			newLabel="v{data.current.versionNumber}"
		/>
	</div>
</div>
