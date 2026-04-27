<script lang="ts">
	import { trpc } from '$lib/utils/trpc';
	import { resolve } from '$app/paths';

	type Tab = 'projects' | 'researchers';

	let tab = $state<Tab>('projects');
	let query = $state('');
	let loading = $state(false);
	let error = $state('');
	let searched = $state(false);

	// Projects tab state
	let projectResults = $state<Awaited<ReturnType<typeof trpc.projects.explore.query>>>([]);
	let pinning = $state<string | null>(null);

	// Researchers tab state
	let researcherResults = $state<Awaited<ReturnType<typeof trpc.users.searchProfiles.query>>>([]);

	async function search() {
		const q = query.trim();
		if (!q) return;
		loading = true;
		error = '';
		searched = true;
		try {
			if (tab === 'projects') {
				projectResults = await trpc.projects.explore.query({ query: q });
			} else {
				researcherResults = await trpc.users.searchProfiles.query(q);
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Search error';
		} finally {
			loading = false;
		}
	}

	async function loadAll() {
		if (tab === 'projects') {
			loading = true;
			error = '';
			searched = true;
			try {
				projectResults = await trpc.projects.explore.query({});
			} catch (e) {
				error = e instanceof Error ? e.message : 'Error';
			} finally {
				loading = false;
			}
		}
	}

	async function togglePin(projectId: string, isPinned: boolean) {
		pinning = projectId;
		try {
			if (isPinned) {
				await trpc.discover.unpin.mutate(projectId);
			} else {
				await trpc.discover.pin.mutate(projectId);
			}
			projectResults = projectResults.map((r) =>
				r.id === projectId ? { ...r, isPinned: !isPinned } : r
			);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Error';
		} finally {
			pinning = null;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') search();
	}

	function switchTab(t: Tab) {
		tab = t;
		query = '';
		error = '';
		searched = false;
	}
</script>

<div class="mx-auto max-w-3xl px-6 py-10">
	<h1 class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">Explore</h1>
	<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
		Discover academic projects and collaborators.
	</p>

	<!-- Tabs -->
	<div class="mt-6 flex gap-1 border-b border-paper-border dark:border-dark-paper-border">
		<button
			onclick={() => switchTab('projects')}
			class="px-4 py-2 font-sans text-sm font-medium transition-colors
				{tab === 'projects'
				? 'border-b-2 border-accent text-accent'
				: 'text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink'}"
		>
			Projects
		</button>
		<button
			onclick={() => switchTab('researchers')}
			class="px-4 py-2 font-sans text-sm font-medium transition-colors
				{tab === 'researchers'
				? 'border-b-2 border-accent text-accent'
				: 'text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink'}"
		>
			Researchers
		</button>
	</div>

	<!-- Search bar -->
	<div class="mt-5 flex gap-2">
		<input
			type="search"
			bind:value={query}
			onkeydown={handleKeydown}
			placeholder={tab === 'projects'
				? 'Search projects by topic…'
				: 'Search researchers by specialty…'}
			class="flex-1 rounded-lg border border-paper-border bg-paper px-4 py-2 font-sans text-sm text-ink placeholder-ink-faint focus:ring-2 focus:ring-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink dark:placeholder-dark-ink-faint"
		/>
		<button
			onclick={search}
			disabled={loading || !query.trim()}
			class="rounded-lg bg-accent px-5 py-2 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
		>
			{loading ? 'Searching…' : 'Buscar'}
		</button>
		{#if tab === 'projects'}
			<button
				onclick={loadAll}
				disabled={loading}
				class="rounded-lg border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50 dark:border-dark-paper-border dark:text-dark-ink-muted"
			>
				Ver todos
			</button>
		{/if}
	</div>

	{#if error}
		<p class="mt-3 font-sans text-sm text-red-600">{error}</p>
	{/if}

	<!-- Projects results -->
	{#if tab === 'projects' && searched}
		<div class="mt-8">
			{#if projectResults.length === 0}
				<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">No projects found.</p>
			{:else}
				<ul class="flex flex-col gap-4">
					{#each projectResults as proj (proj.id)}
						<li
							class="rounded-xl border border-paper-border bg-paper p-5 dark:border-dark-paper-border dark:bg-dark-paper"
						>
							<div class="flex items-start justify-between gap-4">
								<div class="min-w-0 flex-1">
									<h2 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">
										{proj.title}
									</h2>
									{#if proj.description}
										<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
											{proj.description}
										</p>
									{/if}

									{#if proj.abstractContent}
										<div class="bg-surface dark:bg-dark-surface mt-3 rounded-lg px-4 py-3">
											<p
												class="mb-1 font-sans text-xs font-semibold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint"
											>
												Abstract
											</p>
											<p class="line-clamp-4 font-sans text-sm text-ink dark:text-dark-ink">
												{proj.abstractContent}
											</p>
										</div>
									{/if}

									<a
										href={resolve(`/u/${proj.ownerId}`)}
										class="mt-3 flex items-center gap-2 hover:underline"
									>
										<span
											class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 font-sans text-xs font-semibold text-accent"
										>
											{(proj.ownerDisplayName ?? proj.ownerName ?? '?').charAt(0).toUpperCase()}
										</span>
										<span class="font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
											{proj.ownerDisplayName ?? proj.ownerName}
											{#if proj.ownerInstitution}
												· {proj.ownerInstitution}
											{/if}
										</span>
									</a>
								</div>

								<button
									onclick={() => togglePin(proj.id, proj.isPinned)}
									disabled={pinning === proj.id}
									title={proj.isPinned ? 'Remove interest' : 'Mark interest'}
									class="shrink-0 rounded-lg border px-3 py-1.5 font-sans text-xs font-medium transition-colors disabled:opacity-50
										{proj.isPinned
										? 'border-accent bg-accent/10 text-accent'
										: 'border-paper-border text-ink-muted hover:border-accent hover:text-accent dark:border-dark-paper-border dark:text-dark-ink-muted'}"
								>
									{pinning === proj.id ? '…' : proj.isPinned ? '★ Saved' : '☆ Save'}
								</button>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}

	<!-- Researchers results -->
	{#if tab === 'researchers' && searched}
		<div class="mt-8">
			{#if researcherResults.length === 0}
				<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
					No researchers found.
				</p>
			{:else}
				<ul class="flex flex-col gap-4">
					{#each researcherResults as r (r.user_id)}
						<li
							class="rounded-xl border border-paper-border bg-paper p-5 dark:border-dark-paper-border dark:bg-dark-paper"
						>
							<a
								href={resolve(`/u/${r.user_id}`)}
								class="flex items-start gap-4 hover:no-underline"
							>
								<span
									class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/20 font-sans text-sm font-semibold text-accent"
								>
									{(r.display_name ?? r.name ?? '?').charAt(0).toUpperCase()}
								</span>
								<div class="min-w-0 flex-1">
									<p class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">
										{r.display_name ?? r.name}
									</p>
									{#if r.institution}
										<p class="font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
											{r.institution}
										</p>
									{/if}
									{#if r.bio}
										<p
											class="mt-1 line-clamp-2 font-sans text-xs text-ink-muted dark:text-dark-ink-muted"
										>
											{r.bio}
										</p>
									{/if}
								</div>
								<span class="shrink-0 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
									{Math.round(r.similarity * 100)}% match
								</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</div>
