<script lang="ts">
	import { trpc } from '$lib/utils/trpc';

	let {
		templateId,
		initialTitle,
		projectId,
		onclose
	}: {
		templateId: string;
		initialTitle: string;
		projectId: string;
		onclose: () => void;
	} = $props();

	let title = $state(initialTitle);
	let creating = $state(false);
	let error = $state('');

	async function createFromTemplate() {
		if (!title.trim() || !templateId) return;
		creating = true;
		error = '';
		try {
			const doc = await trpc.documents.createFromTemplate.mutate({
				templateDocId: templateId,
				projectId,
				title: title.trim()
			});
			window.location.href = `/projects/${projectId}/documents/${doc.id}`;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Error creating document';
			creating = false;
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
		<h2 class="mb-4 font-serif text-lg font-semibold text-ink dark:text-dark-ink">
			New document from template
		</h2>
		<div class="flex flex-col gap-3">
			<div>
				<label
					for="from-tmpl-title"
					class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
					>Document title</label
				>
				<input
					id="from-tmpl-title"
					type="text"
					bind:value={title}
					placeholder="Document title"
					onkeydown={(e) => {
						if (e.key === 'Enter' && title.trim() && !creating) createFromTemplate();
					}}
					class="w-full rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
				/>
			</div>
			{#if error}
				<p class="font-sans text-sm text-red-600 dark:text-red-400">{error}</p>
			{/if}
			<div class="flex gap-2">
				<button
					onclick={createFromTemplate}
					disabled={creating || !title.trim()}
					class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
				>
					{creating ? 'Creating...' : 'Create and open'}
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
