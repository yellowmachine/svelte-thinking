<script lang="ts">
	import { untrack } from 'svelte';
	import { trpc } from '$lib/utils/trpc';
	import { invalidateAll } from '$app/navigation';

	let {
		docId,
		initialTitle,
		onclose
	}: {
		docId: string;
		initialTitle: string;
		onclose: () => void;
	} = $props();

	let title = $state(untrack(() => initialTitle));
	let saving = $state(false);
	let error = $state('');

	async function saveAsTemplate() {
		if (!title.trim() || !docId) return;
		saving = true;
		error = '';
		try {
			await trpc.documents.saveAsTemplate.mutate({
				documentId: docId,
				templateTitle: title.trim()
			});
			await invalidateAll();
			onclose();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Error saving template';
		} finally {
			saving = false;
		}
	}
</script>

<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
	role="dialog"
	aria-modal="true"
>
	<div
		class="w-full max-w-sm rounded-2xl border border-paper-border bg-paper p-6 shadow-xl dark:border-dark-paper-border dark:bg-dark-paper"
	>
		<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">
			Save as template
		</h2>
		<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			A copy of this document will be saved as a reusable template in this project.
		</p>
		<div class="flex flex-col gap-3">
			<div>
				<label
					for="tmpl-title"
					class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
					>Template name</label
				>
				<input
					id="tmpl-title"
					type="text"
					bind:value={title}
					onkeydown={(e) => {
						if (e.key === 'Enter' && title.trim() && !saving) saveAsTemplate();
					}}
					class="w-full rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
				/>
			</div>
			{#if error}
				<p class="font-sans text-sm text-red-600 dark:text-red-400">{error}</p>
			{/if}
			<div class="flex gap-2">
				<button
					onclick={saveAsTemplate}
					disabled={saving || !title.trim()}
					class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
				>
					{saving ? 'Saving...' : 'Save template'}
				</button>
				<button
					onclick={onclose}
					class="rounded-md border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted"
				>
					Cancel
				</button>
			</div>
		</div>
	</div>
</div>
