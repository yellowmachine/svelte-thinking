<script lang="ts">
	import { offlineDb } from '$lib/offline.db';

	let {
		content,
		documentId,
		onclose
	}: {
		content: string;
		documentId: string;
		onclose: () => void;
	} = $props();
</script>

<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
	role="dialog"
	aria-modal="true"
>
	<div
		class="flex w-full max-w-lg flex-col gap-4 rounded-2xl bg-paper p-6 shadow-xl dark:bg-dark-paper"
	>
		<div>
			<h2 class="font-serif text-lg font-semibold text-ink dark:text-dark-ink">
				Offline changes not synced
			</h2>
			<p class="mt-1 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
				While you were offline, another collaborator took over editing. Your changes were not
				synced. Copy them before closing.
			</p>
		</div>
		<textarea
			readonly
			value={content}
			class="h-48 w-full resize-none rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-mono text-xs text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
		></textarea>
		<div class="flex justify-end">
			<button
				type="button"
				onclick={async () => {
					await offlineDb.pendingEdits
						.where({ documentId, status: 'writer_lost' })
						.modify({ status: 'synced' });
					onclose();
				}}
				class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90"
			>
				Discard
			</button>
		</div>
	</div>
</div>
