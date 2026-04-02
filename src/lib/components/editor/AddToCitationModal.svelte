<script lang="ts">
	import { trpc } from '$lib/utils/trpc';

	let {
		projectId,
		paragraph,
		initialTitle = '',
		initialAuthor = '',
		initialYear = '',
		onclose,
		onsaved
	}: {
		projectId: string;
		paragraph: string;
		initialTitle?: string;
		initialAuthor?: string;
		initialYear?: string;
		onclose: () => void;
		onsaved: (created: boolean) => void;
	} = $props();

	let title = $state(initialTitle);
	let author = $state(initialAuthor);
	let year = $state(initialYear);
	let page = $state('');
	let saving = $state(false);
	let error = $state('');

	async function save() {
		if (!title.trim()) { error = 'Title is required'; return; }
		saving = true;
		error = '';
		try {
			const result = await trpc.references.addFromReadingNote.mutate({
				projectId,
				title: title.trim(),
				authorRaw: author.trim(),
				year: year.trim() || undefined,
				paragraph,
				page: page.trim() || undefined
			});
			onsaved(result.created);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Error saving citation';
		} finally {
			saving = false;
		}
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}
</script>

<svelte:window on:keydown={onkeydown} />

<!-- Backdrop -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
	role="dialog"
	aria-modal="true"
	aria-label="Add to citation"
>
	<div class="w-full max-w-md rounded-xl border border-paper-border bg-paper shadow-xl dark:border-dark-paper-border dark:bg-dark-paper">
		<!-- Header -->
		<div class="flex items-center justify-between border-b border-paper-border px-5 py-4 dark:border-dark-paper-border">
			<h2 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">Add to citation</h2>
			<button
				onclick={onclose}
				class="text-ink-faint transition-colors hover:text-ink dark:text-dark-ink-faint dark:hover:text-dark-ink"
				aria-label="Close"
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M18 6L6 18M6 6l12 12"/>
				</svg>
			</button>
		</div>

		<div class="flex flex-col gap-4 p-5">
			<!-- Fields -->
			<div class="grid grid-cols-2 gap-3">
				<div class="col-span-2 flex flex-col gap-1.5">
					<label class="font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted">Title</label>
					<input
						type="text"
						bind:value={title}
						placeholder="Book title"
						class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
					/>
				</div>
				<div class="flex flex-col gap-1.5">
					<label class="font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted">Author</label>
					<input
						type="text"
						bind:value={author}
						placeholder="First Last"
						class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
					/>
				</div>
				<div class="flex flex-col gap-1.5">
					<label class="font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted">Year</label>
					<input
						type="text"
						bind:value={year}
						placeholder="2024"
						maxlength="4"
						class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
					/>
				</div>
				<div class="col-span-2 flex flex-col gap-1.5">
					<label class="font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted">Page</label>
					<input
						type="text"
						bind:value={page}
						placeholder="47"
						class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
					/>
				</div>
			</div>

			<!-- Passage preview -->
			<div class="flex flex-col gap-1.5">
				<span class="font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted">Selected passage</span>
				<div class="max-h-28 overflow-y-auto rounded-md border border-paper-border bg-paper-ui px-3 py-2 dark:border-dark-paper-border dark:bg-dark-paper-ui">
					<p class="font-serif text-sm italic text-ink-muted dark:text-dark-ink-muted line-clamp-4">"{paragraph}"</p>
				</div>
			</div>

			{#if error}
				<p class="rounded-lg bg-red-50 px-3 py-2 font-sans text-xs text-red-700 dark:bg-red-900/20 dark:text-red-400">{error}</p>
			{/if}

			<!-- Actions -->
			<div class="flex justify-end gap-2 pt-1">
				<button
					type="button"
					onclick={onclose}
					class="rounded-md border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted transition-colors hover:text-ink dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:text-dark-ink"
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={save}
					disabled={saving || !title.trim()}
					class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
				>
					{saving ? 'Saving…' : 'Save'}
				</button>
			</div>
		</div>
	</div>
</div>
