<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import ProjectCard from '$lib/components/projects/ProjectCard.svelte';
	import { trpc } from '$lib/utils/trpc';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const projects = $derived(data.projects);

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
				description: newDescription.trim() || undefined
			});
			await invalidateAll();
			newTitle = '';
			newDescription = '';
			showCreate = false;
		} catch (e) {
			createError = e instanceof Error ? e.message : 'Error al crear el proyecto';
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
</script>

<div class="mx-auto max-w-5xl px-6 py-8">
	<!-- Header -->
	<div class="mb-8 flex items-center justify-between">
		<div>
			<h1 class="font-serif text-3xl font-semibold text-ink dark:text-dark-ink">Mis proyectos</h1>
			<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				{projects.length === 1 ? '1 proyecto' : `${projects.length} proyectos`}
			</p>
		</div>
		<button
			onclick={() => (showCreate = true)}
			class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover"
		>
			Nuevo proyecto
		</button>
	</div>

	<!-- Create form -->
	{#if showCreate}
		<div class="mb-6 rounded-xl border border-accent/30 bg-paper p-6 dark:bg-dark-paper">
			<h2 class="mb-4 font-serif text-lg font-semibold text-ink dark:text-dark-ink">
				Nuevo proyecto
			</h2>
			<div class="flex flex-col gap-4">
				<div class="flex flex-col gap-1.5">
					<label
						for="project-title"
						class="font-sans text-sm font-medium text-ink dark:text-dark-ink"
					>
						Título
					</label>
					<input
						id="project-title"
						type="text"
						bind:value={newTitle}
						placeholder="Ej: Análisis del discurso académico en redes sociales"
						class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
					/>
				</div>
				<div class="flex flex-col gap-1.5">
					<label
						for="project-desc"
						class="font-sans text-sm font-medium text-ink dark:text-dark-ink"
					>
						Descripción <span class="font-normal text-ink-faint">(opcional)</span>
					</label>
					<textarea
						id="project-desc"
						bind:value={newDescription}
						rows={2}
						placeholder="Breve descripción del proyecto..."
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
						{creating ? 'Creando...' : 'Crear proyecto'}
					</button>
					<button
						onclick={cancelCreate}
						class="rounded-md border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted"
					>
						Cancelar
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
			<p class="font-serif text-lg font-medium text-ink dark:text-dark-ink">Sin proyectos aún</p>
			<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				Crea tu primer proyecto académico para empezar.
			</p>
			<button
				onclick={() => (showCreate = true)}
				class="mt-6 rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover"
			>
				Crear proyecto
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
					updatedAt={proj.updatedAt}
					onclick={() => (window.location.href = `/projects/${proj.id}`)}
				/>
			{/each}
		</div>
	{/if}
</div>
