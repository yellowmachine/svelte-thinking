<script lang="ts">
	import { trpc } from '$lib/utils/trpc';

	let { projectId, initialTags }: { projectId: string; initialTags: { id: string; name: string }[] } = $props();

	let tags = $state([...initialTags]);
	let allTags = $state<{ id: string; userId: string; name: string }[]>([]);
	let inputValue = $state('');
	let showDropdown = $state(false);
	let loading = $state(false);

	const filtered = $derived(
		inputValue.trim()
			? allTags.filter(
					(t) =>
						t.name.toLowerCase().includes(inputValue.toLowerCase()) &&
						!tags.some((pt) => pt.id === t.id)
				)
			: allTags.filter((t) => !tags.some((pt) => pt.id === t.id))
	);

	async function openDropdown() {
		if (allTags.length === 0) {
			allTags = await trpc.tags.list.query();
		}
		showDropdown = true;
	}

	async function addTag(t: { id: string; name: string }) {
		if (tags.some((pt) => pt.id === t.id)) return;
		await trpc.tags.addToProject.mutate({ projectId, tagId: t.id });
		tags = [...tags, t];
		inputValue = '';
		showDropdown = false;
	}

	async function createAndAdd() {
		const name = inputValue.trim();
		if (!name) return;
		loading = true;
		try {
			const newTag = await trpc.tags.create.mutate({ name });
			allTags = [...allTags, newTag];
			await addTag(newTag);
		} finally {
			loading = false;
		}
	}

	async function removeTag(tagId: string) {
		await trpc.tags.removeFromProject.mutate({ projectId, tagId });
		tags = tags.filter((t) => t.id !== tagId);
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			const exact = filtered.find((t) => t.name.toLowerCase() === inputValue.toLowerCase());
			if (exact) addTag(exact);
			else if (inputValue.trim()) createAndAdd();
		}
		if (e.key === 'Escape') showDropdown = false;
	}
</script>

<div class="relative">
	<!-- Current tags -->
	{#if tags.length > 0}
		<div class="mb-2 flex flex-wrap gap-1.5">
			{#each tags as t (t.id)}
				<span class="flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-0.5 font-sans text-xs font-medium text-accent dark:bg-accent/20">
					{t.name}
					<button
						onclick={() => removeTag(t.id)}
						class="ml-0.5 rounded-full text-accent/60 hover:text-accent"
						aria-label="Remove tag"
					>✕</button>
				</span>
			{/each}
		</div>
	{/if}

	<!-- Input -->
	<div class="relative">
		<input
			type="text"
			bind:value={inputValue}
			onfocus={openDropdown}
			onkeydown={onKeydown}
			oninput={() => { showDropdown = true; }}
			placeholder="Add tag…"
			class="w-full rounded-md border border-paper-border bg-paper-ui px-3 py-1.5 font-sans text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
		/>

		{#if showDropdown && (filtered.length > 0 || inputValue.trim())}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-md border border-paper-border bg-paper shadow-lg dark:border-dark-paper-border dark:bg-dark-paper"
				onmousedown={(e) => e.preventDefault()}
			>
				{#each filtered as t (t.id)}
					<button
						type="button"
						onclick={() => addTag(t)}
						class="flex w-full items-center px-3 py-1.5 font-sans text-xs text-ink hover:bg-paper-ui dark:text-dark-ink dark:hover:bg-dark-paper-ui"
					>{t.name}</button>
				{/each}
				{#if inputValue.trim() && !filtered.some((t) => t.name.toLowerCase() === inputValue.toLowerCase())}
					<button
						type="button"
						onclick={createAndAdd}
						disabled={loading}
						class="flex w-full items-center gap-1.5 px-3 py-1.5 font-sans text-xs text-accent hover:bg-paper-ui dark:hover:bg-dark-paper-ui disabled:opacity-50"
					>
						<span class="font-medium">+ Create</span> "{inputValue.trim()}"
					</button>
				{/if}
			</div>
		{/if}
	</div>
</div>

<!-- Close dropdown on outside click -->
<svelte:window onclick={(e) => {
	if (!(e.target as HTMLElement).closest?.('.relative')) showDropdown = false;
}} />
