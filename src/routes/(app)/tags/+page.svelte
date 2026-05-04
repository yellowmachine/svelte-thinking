<script lang="ts">
	import { onMount } from 'svelte';
	import { trpc } from '$lib/utils/trpc';

	type Tag = { id: string; name: string; projectCount: number };

	let tags = $state<Tag[]>([]);
	let loading = $state(true);

	let editingId = $state<string | null>(null);
	let editingName = $state('');
	let editError = $state('');
	let saving = $state(false);

	let deletingId = $state<string | null>(null);

	onMount(async () => {
		tags = await trpc.tags.listWithCount.query();
		loading = false;
	});

	function startEdit(tag: Tag) {
		editingId = tag.id;
		editingName = tag.name;
		editError = '';
	}

	function cancelEdit() {
		editingId = null;
		editingName = '';
		editError = '';
	}

	async function saveEdit(id: string) {
		const name = editingName.trim();
		if (!name) return;
		saving = true;
		editError = '';
		try {
			const updated = await trpc.tags.update.mutate({ id, name });
			tags = tags.map((t) => (t.id === id ? { ...t, name: updated.name } : t));
			cancelEdit();
		} catch (e: unknown) {
			const msg = (e as { message?: string })?.message;
			editError = msg ?? 'Error saving tag.';
		} finally {
			saving = false;
		}
	}

	function onKeydown(e: KeyboardEvent, id: string) {
		if (e.key === 'Enter') {
			e.preventDefault();
			saveEdit(id);
		}
		if (e.key === 'Escape') cancelEdit();
	}

	async function deleteTag(id: string) {
		deletingId = id;
		try {
			await trpc.tags.delete.mutate(id);
			tags = tags.filter((t) => t.id !== id);
		} finally {
			deletingId = null;
		}
	}
</script>

<div class="mx-auto max-w-2xl px-6 py-10">
	<div class="mb-8">
		<h1 class="font-serif text-3xl font-semibold text-ink dark:text-dark-ink">Tags</h1>
		<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Manage your tags. Renaming a tag updates it across all projects.
		</p>
	</div>

	{#if loading}
		<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">Loading…</p>
	{:else if tags.length === 0}
		<div
			class="rounded-xl border border-paper-border bg-paper p-8 text-center dark:border-dark-paper-border dark:bg-dark-paper"
		>
			<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				No tags yet. Add tags from any project page.
			</p>
		</div>
	{:else}
		<div
			class="rounded-xl border border-paper-border bg-paper dark:border-dark-paper-border dark:bg-dark-paper"
		>
			{#each tags as tag, i (tag.id)}
				<div
					class="flex items-center gap-3 px-4 py-3 {i < tags.length - 1
						? 'border-b border-paper-border dark:border-dark-paper-border'
						: ''}"
				>
					{#if editingId === tag.id}
						<div class="flex flex-1 flex-col gap-1">
							<input
								type="text"
								bind:value={editingName}
								onkeydown={(e) => onKeydown(e, tag.id)}
								onblur={() => saveEdit(tag.id)}
								disabled={saving}
								{@attach (el: HTMLInputElement) => {
									el.focus();
								}}
								class="w-full rounded-md border border-accent bg-paper-ui px-2.5 py-1 font-sans text-sm text-ink focus:outline-none disabled:opacity-50 dark:bg-dark-paper-ui dark:text-dark-ink"
							/>
							{#if editError}
								<p class="font-sans text-xs text-red-600">{editError}</p>
							{/if}
						</div>
						<button
							type="button"
							onclick={cancelEdit}
							class="shrink-0 font-sans text-xs text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
						>
							Cancel
						</button>
					{:else}
						<button
							type="button"
							onclick={() => startEdit(tag)}
							class="flex-1 text-left font-sans text-sm text-ink hover:text-accent dark:text-dark-ink dark:hover:text-accent"
						>
							{tag.name}
						</button>
						<span class="shrink-0 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
							{tag.projectCount === 1 ? '1 project' : `${tag.projectCount} projects`}
						</span>
						<button
							type="button"
							onclick={() => startEdit(tag)}
							aria-label="Rename tag"
							class="shrink-0 text-ink-faint transition-colors hover:text-ink dark:text-dark-ink-faint dark:hover:text-dark-ink"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
								<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
							</svg>
						</button>
						<button
							type="button"
							onclick={() => deleteTag(tag.id)}
							disabled={deletingId === tag.id}
							aria-label="Delete tag"
							class="shrink-0 text-ink-faint transition-colors hover:text-red-600 disabled:opacity-40 dark:text-dark-ink-faint dark:hover:text-red-500"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<polyline points="3 6 5 6 21 6" />
								<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
								<path d="M10 11v6" />
								<path d="M14 11v6" />
								<path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
							</svg>
						</button>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
