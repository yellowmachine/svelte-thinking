<script lang="ts">
	import { trpc } from '$lib/utils/trpc';

	let {
		documentId,
		isDirty,
		ondosave,
		oncommitted,
		onclose
	}: {
		documentId: string;
		isDirty: boolean;
		ondosave: () => Promise<void>;
		oncommitted: () => void;
		onclose: () => void;
	} = $props();

	let commitMessage = $state('');
	let committing = $state(false);
	let commitError = $state('');

	async function doCommit() {
		if (!commitMessage.trim()) return;
		committing = true;
		commitError = '';
		try {
			if (isDirty) await ondosave();
			await trpc.documents.commit.mutate({ documentId, message: commitMessage.trim() });
			commitMessage = '';
			oncommitted();
		} catch (e) {
			commitError = e instanceof Error ? e.message : 'Error creating version';
		} finally {
			committing = false;
		}
	}

	function handleClose() {
		commitMessage = '';
		commitError = '';
		onclose();
	}
</script>

<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-4 backdrop-blur-sm dark:bg-dark-ink/30"
>
	<div
		class="w-full max-w-md rounded-2xl border border-paper-border bg-paper p-6 shadow-xl dark:border-dark-paper-border dark:bg-dark-paper"
		role="dialog"
		aria-modal="true"
		aria-labelledby="commit-dialog-title"
	>
		<h2
			id="commit-dialog-title"
			class="font-serif text-xl font-semibold text-ink dark:text-dark-ink"
		>
			Create version
		</h2>
		<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Describe the changes in this version.
		</p>

		<div class="mt-4 flex flex-col gap-3">
			<textarea
				bind:value={commitMessage}
				rows={3}
				autofocus
				placeholder="E.g. Introduction revision and hypothesis adjustment"
				class="resize-none rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
			></textarea>

			{#if commitError}
				<p class="font-sans text-sm text-red-600 dark:text-red-400">{commitError}</p>
			{/if}

			<div class="flex gap-3">
				<button
					onclick={doCommit}
					disabled={committing || !commitMessage.trim()}
					class="flex-1 rounded-md bg-accent py-2.5 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
				>
					{committing ? 'Saving version...' : 'Create version'}
				</button>
				<button
					onclick={handleClose}
					class="rounded-md border border-paper-border px-4 py-2.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted"
				>
					Cancel
				</button>
			</div>
		</div>
	</div>
</div>
