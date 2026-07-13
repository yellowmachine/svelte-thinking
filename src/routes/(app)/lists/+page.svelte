<script lang="ts">
	import { trpc } from '$lib/utils/trpc';
	import { resolve } from '$app/paths';
	import { SvelteSet, SvelteMap } from 'svelte/reactivity';
	import SafeDeleteDialog from '$lib/components/ui/SafeDeleteDialog.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Aggregator = (typeof data.aggregators)[number];
	type AggregatorItem = Awaited<ReturnType<typeof trpc.blogAggregators.listItems.query>>[number];

	let createdAggregators = $state<Aggregator[]>([]);
	let deletedIds = new SvelteSet<string>();
	let editOverrides = new SvelteMap<string, { title: string; description: string | null }>();
	let itemCountOverrides = new SvelteMap<string, number>();

	const aggregators = $derived(
		[...createdAggregators, ...data.aggregators]
			.filter((a) => !deletedIds.has(a.id))
			.map((a) => ({
				...a,
				title: editOverrides.get(a.id)?.title ?? a.title,
				description: editOverrides.get(a.id)?.description ?? a.description,
				itemCount: itemCountOverrides.get(a.id) ?? a.itemCount
			}))
	);

	let newTitle = $state('');
	let creating = $state(false);
	let createError = $state('');

	let expandedId = $state<string | null>(null);
	let items = $state<AggregatorItem[]>([]);
	let itemsLoading = $state(false);
	let newHandle = $state('');
	let addingBlog = $state(false);
	let addBlogError = $state('');

	let editingId = $state<string | null>(null);
	let editTitle = $state('');
	let editDescription = $state('');
	let savingEdit = $state(false);

	let aggregatorToDelete = $state<Aggregator | null>(null);
	let deletingId = $state<string | null>(null);

	async function createAggregator() {
		if (!newTitle.trim()) return;
		creating = true;
		createError = '';
		try {
			const created = await trpc.blogAggregators.create.mutate({ title: newTitle.trim() });
			createdAggregators = [
				{
					id: created.id,
					slug: created.slug,
					title: newTitle.trim(),
					description: null,
					createdAt: new Date(),
					itemCount: 0
				},
				...createdAggregators
			];
			newTitle = '';
		} catch (e) {
			createError = e instanceof Error ? e.message : 'Error al crear la lista.';
		} finally {
			creating = false;
		}
	}

	async function toggleExpand(agg: Aggregator) {
		if (expandedId === agg.id) {
			expandedId = null;
			return;
		}
		expandedId = agg.id;
		editingId = null;
		itemsLoading = true;
		addBlogError = '';
		try {
			items = await trpc.blogAggregators.listItems.query(agg.id);
		} finally {
			itemsLoading = false;
		}
	}

	async function addBlog(agg: Aggregator) {
		if (!newHandle.trim()) return;
		addingBlog = true;
		addBlogError = '';
		try {
			const created = await trpc.blogAggregators.addBlog.mutate({
				aggregatorId: agg.id,
				handle: newHandle.trim()
			});
			items = [
				...items,
				{
					id: created.id,
					targetUserId: created.targetUserId,
					handle: created.handle,
					displayName: created.displayName,
					addedAt: created.addedAt
				}
			];
			itemCountOverrides.set(agg.id, agg.itemCount + 1);
			newHandle = '';
		} catch (e) {
			addBlogError = e instanceof Error ? e.message : 'Error al añadir el blog.';
		} finally {
			addingBlog = false;
		}
	}

	async function removeItem(agg: Aggregator, item: AggregatorItem) {
		await trpc.blogAggregators.removeItem.mutate(item.id);
		items = items.filter((i) => i.id !== item.id);
		itemCountOverrides.set(agg.id, Math.max(0, agg.itemCount - 1));
	}

	function startEdit(agg: Aggregator) {
		editingId = agg.id;
		editTitle = agg.title;
		editDescription = agg.description ?? '';
	}

	async function saveEdit(agg: Aggregator) {
		if (!editTitle.trim()) return;
		savingEdit = true;
		try {
			await trpc.blogAggregators.update.mutate({
				id: agg.id,
				title: editTitle.trim(),
				description: editDescription.trim() || undefined
			});
			editOverrides.set(agg.id, {
				title: editTitle.trim(),
				description: editDescription.trim() || null
			});
			editingId = null;
		} finally {
			savingEdit = false;
		}
	}

	async function deleteAggregator() {
		const agg = aggregatorToDelete;
		if (!agg) return;
		deletingId = agg.id;
		try {
			await trpc.blogAggregators.delete.mutate(agg.id);
			deletedIds.add(agg.id);
			if (expandedId === agg.id) expandedId = null;
		} finally {
			deletingId = null;
			aggregatorToDelete = null;
		}
	}

	const dateFmt = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' });
</script>

<div class="mx-auto max-w-3xl px-6 py-10">
	<div class="mb-8">
		<h1 class="font-serif text-3xl font-semibold text-ink dark:text-dark-ink">Listas</h1>
		<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Listas públicas y curadas de otros blogs. Cada una tiene su propia página y feed RSS.
		</p>
	</div>

	{#if !data.handle}
		<div
			class="rounded-xl border border-paper-border bg-paper p-6 text-center dark:border-dark-paper-border dark:bg-dark-paper"
		>
			<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				Configura tu blog antes de crear una lista.
			</p>
			<a
				href={resolve('/settings?tab=blog')}
				class="inline-block rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90"
			>
				Configurar mi blog →
			</a>
		</div>
	{:else}
		<div class="mb-6 flex gap-2">
			<input
				bind:value={newTitle}
				placeholder="Título de la nueva lista"
				class="flex-1 rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
			/>
			<button
				onclick={createAggregator}
				disabled={creating || !newTitle.trim()}
				class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
			>
				{creating ? 'Creando...' : 'Crear lista'}
			</button>
		</div>
		{#if createError}
			<p class="mb-4 font-sans text-sm text-red-600 dark:text-red-400">{createError}</p>
		{/if}

		{#if aggregators.length === 0}
			<p class="font-sans text-sm text-ink-faint dark:text-dark-ink-faint">
				Todavía no has creado ninguna lista.
			</p>
		{:else}
			<div class="flex flex-col gap-3">
				{#each aggregators as agg (agg.id)}
					<div
						class="rounded-lg border border-paper-border bg-paper dark:border-dark-paper-border dark:bg-dark-paper"
					>
						<div class="flex items-center justify-between gap-3 px-4 py-3">
							<div class="min-w-0 flex-1">
								{#if editingId === agg.id}
									<div class="flex flex-col gap-2">
										<input
											bind:value={editTitle}
											class="w-full rounded-md border border-paper-border bg-paper-ui px-2 py-1 font-sans text-sm text-ink focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
										/>
										<textarea
											bind:value={editDescription}
											rows="2"
											placeholder="Descripción (opcional)"
											class="w-full rounded-md border border-paper-border bg-paper-ui px-2 py-1 font-sans text-sm text-ink focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
										></textarea>
										<div class="flex gap-3">
											<button
												onclick={() => saveEdit(agg)}
												disabled={savingEdit}
												class="font-sans text-xs text-accent hover:text-accent-hover disabled:opacity-50"
											>
												Guardar
											</button>
											<button
												onclick={() => (editingId = null)}
												class="font-sans text-xs text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
											>
												Cancelar
											</button>
										</div>
									</div>
								{:else}
									<a
										href={resolve('/@[handle]/list/[slug]', {
											handle: data.handle,
											slug: agg.slug
										})}
										target="_blank"
										rel="noopener noreferrer"
										class="truncate font-sans text-sm font-medium text-ink hover:underline dark:text-dark-ink"
									>
										{agg.title}
									</a>
									{#if agg.description}
										<p class="font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
											{agg.description}
										</p>
									{/if}
									<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
										{agg.itemCount} blog{agg.itemCount === 1 ? '' : 's'} · creada el {dateFmt.format(
											new Date(agg.createdAt)
										)}
									</p>
								{/if}
							</div>
							{#if editingId !== agg.id}
								<div class="flex shrink-0 items-center gap-3">
									<button
										type="button"
										onclick={() => toggleExpand(agg)}
										class="font-sans text-xs text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
									>
										Gestionar blogs
									</button>
									<button
										type="button"
										onclick={() => startEdit(agg)}
										class="font-sans text-xs text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
									>
										Editar
									</button>
									<button
										type="button"
										onclick={() => (aggregatorToDelete = agg)}
										disabled={deletingId === agg.id}
										class="font-sans text-xs text-red-500 transition-colors hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
									>
										Eliminar
									</button>
								</div>
							{/if}
						</div>

						{#if expandedId === agg.id}
							<div class="border-t border-paper-border px-4 py-3 dark:border-dark-paper-border">
								<div class="flex gap-2">
									<input
										bind:value={newHandle}
										placeholder="@handle del blog a añadir"
										class="flex-1 rounded-md border border-paper-border bg-paper-ui px-3 py-1.5 font-sans text-sm text-ink focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
									/>
									<button
										onclick={() => addBlog(agg)}
										disabled={addingBlog || !newHandle.trim()}
										class="rounded-md bg-accent px-3 py-1.5 font-sans text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
									>
										{addingBlog ? 'Añadiendo...' : 'Añadir'}
									</button>
								</div>
								{#if addBlogError}
									<p class="mt-2 font-sans text-xs text-red-600 dark:text-red-400">
										{addBlogError}
									</p>
								{/if}

								{#if itemsLoading}
									<p class="mt-3 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
										Cargando...
									</p>
								{:else if items.length === 0}
									<p class="mt-3 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
										Esta lista todavía no incluye ningún blog.
									</p>
								{:else}
									<ul class="mt-3 flex flex-col gap-1.5">
										{#each items as item (item.id)}
											<li class="flex items-center justify-between gap-2">
												<a
													href={resolve('/@[handle]', { handle: item.handle ?? '' })}
													target="_blank"
													rel="noopener noreferrer"
													class="font-sans text-sm text-ink hover:underline dark:text-dark-ink"
												>
													{item.displayName ?? `@${item.handle}`}
												</a>
												<button
													type="button"
													onclick={() => removeItem(agg, item)}
													class="font-sans text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
												>
													Quitar
												</button>
											</li>
										{/each}
									</ul>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<SafeDeleteDialog
	open={!!aggregatorToDelete}
	title="Eliminar lista"
	label={aggregatorToDelete?.title ?? ''}
	confirmLabel="Eliminar"
	warning="La página pública de esta lista dejará de existir."
	deleting={deletingId === aggregatorToDelete?.id}
	requireCode={false}
	onconfirm={deleteAggregator}
	oncancel={() => (aggregatorToDelete = null)}
/>
