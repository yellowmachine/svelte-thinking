<script lang="ts">
	import { invalidateAll, goto } from '$app/navigation';
	import ProjectCard from '$lib/components/projects/ProjectCard.svelte';
	import SafeDeleteDialog from '$lib/components/ui/SafeDeleteDialog.svelte';
	import { trpc } from '$lib/utils/trpc';
	import { workspaceStore } from '$lib/stores/workspace.svelte';
	import { page } from '$app/state';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	$effect(() => {
		const orgParam = page.url.searchParams.get('org');
		if (orgParam === 'personal') {
			workspaceStore.set({ id: null, name: 'Personal' });
		} else if (orgParam) {
			workspaceStore.syncToOrg(orgParam);
		}
	});

	// Filter projects by active workspace
	const projects = $derived(
		workspaceStore.current.id === null
			? data.projects.filter((p) => !p.orgId)
			: data.projects.filter((p) => p.orgId === workspaceStore.current.id)
	);

	const workspaceName = $derived(workspaceStore.current.name);
	const isOrgWorkspace = $derived(workspaceStore.current.id !== null);

	let showCreate = $state(false);
	let newTitle = $state('');
	let newDescription = $state('');
	let creating = $state(false);
	let createError = $state('');

	async function createProject() {
		if (!newTitle.trim()) return;
		creating = true;
		createError = '';
		try {
			await trpc.projects.create.mutate({
				title: newTitle.trim(),
				description: newDescription.trim() || undefined,
				orgId: workspaceStore.current.id ?? undefined
			});
			await invalidateAll();
			newTitle = '';
			newDescription = '';
			showCreate = false;
		} catch (e) {
			createError = e instanceof Error ? e.message : 'Error creating project';
		} finally {
			creating = false;
		}
	}

	function cancelCreate() {
		showCreate = false;
		newTitle = '';
		newDescription = '';
		createError = '';
	}

	let deleteTarget = $state<{ id: string; title: string } | null>(null);
	let deletingProject = $state(false);

	async function handleDeleteProject() {
		if (!deleteTarget) return;
		deletingProject = true;
		try {
			await trpc.projects.delete.mutate(deleteTarget.id);
			await invalidateAll();
			deleteTarget = null;
		} finally {
			deletingProject = false;
		}
	}

	let importing = $state(false);
	let importError = $state('');
	let importFileInput = $state<HTMLInputElement | null>(null);

	async function handleImportFile(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		importing = true;
		importError = '';
		try {
			const formData = new FormData();
			formData.append('file', file);
			const res = await fetch('/api/projects/import', { method: 'POST', body: formData });
			if (!res.ok) {
				const text = await res.text();
				throw new Error(text || `Error ${res.status}`);
			}
			const { projectId } = await res.json();
			await goto(`/projects/${projectId}`, { invalidateAll: true });
		} catch (e) {
			importError = e instanceof Error ? e.message : 'Error al importar';
		} finally {
			importing = false;
			input.value = '';
		}
	}
</script>

<div class="mx-auto max-w-5xl px-6 py-8">
	<!-- Header -->
	<div class="mb-8 flex items-center justify-between">
		<div>
			<div class="flex items-center gap-2">
				<h1 class="font-serif text-3xl font-semibold text-ink dark:text-dark-ink">
					{isOrgWorkspace ? workspaceName : 'My projects'}
				</h1>
				{#if isOrgWorkspace}
					<span class="rounded-full border border-accent/30 px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wide text-accent">org</span>
				{/if}
			</div>
			<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				{projects.length === 1 ? '1 project' : `${projects.length} projects`}
			</p>
		</div>
		<div class="flex items-center gap-2">
			<input
				bind:this={importFileInput}
				type="file"
				accept=".zip"
				class="hidden"
				onchange={handleImportFile}
			/>
			<button
				onclick={() => importFileInput?.click()}
				disabled={importing}
				class="rounded-md border border-paper-border px-4 py-2 font-sans text-sm font-medium text-ink-muted transition-colors hover:bg-paper-ui disabled:opacity-50 dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
			>
				{importing ? 'Importing…' : 'Import'}
			</button>
			<button
				onclick={() => (showCreate = true)}
				class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover"
			>
				New project
			</button>
		</div>
	</div>

	{#if importError}
		<p class="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 font-sans text-sm text-red-600 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-400">
			{importError}
		</p>
	{/if}

	<!-- Create form -->
	{#if showCreate}
		<div class="mb-6 rounded-xl border border-accent/30 bg-paper p-6 dark:bg-dark-paper">
			<h2 class="mb-4 font-serif text-lg font-semibold text-ink dark:text-dark-ink">
				New project
			</h2>
			<div class="flex flex-col gap-4">
				<div class="flex flex-col gap-1.5">
					<label
						for="project-title"
						class="font-sans text-sm font-medium text-ink dark:text-dark-ink"
					>
						Title
					</label>
					<input
						id="project-title"
						type="text"
						bind:value={newTitle}
						placeholder="E.g.: Analysis of academic discourse on social media"
						class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
					/>
				</div>
				<div class="flex flex-col gap-1.5">
					<label
						for="project-desc"
						class="font-sans text-sm font-medium text-ink dark:text-dark-ink"
					>
						Description <span class="font-normal text-ink-faint">(optional)</span>
					</label>
					<textarea
						id="project-desc"
						bind:value={newDescription}
						rows={2}
						placeholder="Brief project description..."
						class="resize-none rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
					></textarea>
				</div>

				{#if createError}
					<p class="font-sans text-sm text-red-600 dark:text-red-400">{createError}</p>
				{/if}

				<div class="flex gap-3">
					<button
						onclick={createProject}
						disabled={creating || !newTitle.trim()}
						class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
					>
						{creating ? 'Creating...' : 'Create project'}
					</button>
					<button
						onclick={cancelCreate}
						class="rounded-md border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted"
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Empty state -->
	{#if projects.length === 0}
		<div
			class="flex flex-col items-center justify-center rounded-xl border border-dashed border-paper-border py-20 dark:border-dark-paper-border"
		>
			<div
				class="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-paper-ui dark:bg-dark-paper-ui"
			>
				<svg
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					class="text-ink-faint dark:text-dark-ink-faint"
				>
					<path
						d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
					<path
						d="M14 2v6h6M16 13H8M16 17H8M10 9H8"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</div>
			<p class="font-serif text-lg font-medium text-ink dark:text-dark-ink">No projects yet</p>
			<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				Create your first academic project to get started.
			</p>
			<button
				onclick={() => (showCreate = true)}
				class="mt-6 rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover"
			>
				Create project
			</button>
		</div>
	{:else}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each projects as proj (proj.id)}
				<ProjectCard
					title={proj.title}
					description={proj.description ?? undefined}
					status={proj.status}
					collaboratorCount={proj.collaboratorCount}
					openComments={proj.openComments}
					updatedAt={proj.updatedAt}
					onclick={() => (window.location.href = `/projects/${proj.id}`)}
					ondelete={proj.ownerId === data.currentUserId
						? () => { deleteTarget = { id: proj.id, title: proj.title }; }
						: undefined}
				/>
			{/each}
		</div>
	{/if}
</div>

<SafeDeleteDialog
	open={deleteTarget !== null}
	label="the project «{deleteTarget?.title}»"
	warning="All documents, versions, comments and associated data will be permanently deleted."
	deleting={deletingProject}
	onconfirm={handleDeleteProject}
	oncancel={() => (deleteTarget = null)}
/>
