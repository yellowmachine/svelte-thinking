<script lang="ts">
	import { page } from '$app/state';
	import { trpc } from '$lib/utils/trpc';

	type Project = { id: string; title: string };
	type Sheet = 'note' | 'photo' | null;

	let sheet = $state<Sheet>(null);
	let projects: Project[] = $state([]);
	let loading = $state(false);
	let creating = $state(false);
	let uploadError = $state('');
	let photoProjectId = $state('');
	let photoInputEl: HTMLInputElement | undefined;

	const onProjects = $derived(page.url.pathname.startsWith('/projects'));

	async function openSheet(type: Sheet) {
		sheet = type;
		uploadError = '';
		photoProjectId = '';
		if (projects.length === 0) {
			loading = true;
			try {
				projects = await trpc.projects.listForQuickNote.query();
			} finally {
				loading = false;
			}
		}
	}

	function close() {
		sheet = null;
		uploadError = '';
		photoProjectId = '';
	}

	async function createNote(projectId: string) {
		if (creating) return;
		creating = true;
		const now = new Date();
		const pad = (n: number) => String(n).padStart(2, '0');
		const title = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
		try {
			const doc = await trpc.documents.create.mutate({ projectId, title, type: 'notes' });
			close();
			window.location.href = `/projects/${projectId}/documents/${doc.id}`;
		} finally {
			creating = false;
		}
	}

	function selectPhotoProject(projectId: string) {
		photoProjectId = projectId;
		photoInputEl?.click();
	}

	async function handlePhotoChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		uploadError = '';
		const fd = new FormData();
		fd.append('file', file);

		const res = await fetch(`/api/projects/${photoProjectId}/photos`, {
			method: 'POST',
			body: fd
		});

		if (!res.ok) {
			const err = await res.json().catch(() => ({ message: 'Error al subir' }));
			uploadError = err.message ?? 'Error al subir la foto';
		} else {
			close();
			window.location.href = `/projects/${photoProjectId}/photos`;
		}

		input.value = '';
	}
</script>

<!-- Hidden file input for camera/gallery -->
<input
	type="file"
	accept="image/*"
	capture="environment"
	class="hidden"
	onchange={handlePhotoChange}
	{@attach (el: HTMLInputElement) => {
		photoInputEl = el;
		return () => {
			photoInputEl = undefined;
		};
	}}
/>

<!-- Bottom nav -->
<nav
	class="fixed inset-x-0 bottom-0 z-10 border-t border-paper-border bg-paper/95 pb-safe backdrop-blur-sm sm:hidden dark:border-dark-paper-border dark:bg-dark-paper/95"
>
	<div class="flex items-center">
		<!-- Proyectos -->
		<a
			href="/projects"
			class="flex flex-1 flex-col items-center gap-1 py-2.5 font-sans text-xs transition-colors {onProjects
				? 'text-accent'
				: 'text-ink-muted dark:text-dark-ink-muted'}"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.75"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
			</svg>
			Proyectos
		</a>

		<!-- + Nota -->
		<button
			onclick={() => openSheet('note')}
			class="flex flex-1 flex-col items-center gap-1 py-2.5 font-sans text-xs text-ink-muted transition-colors dark:text-dark-ink-muted"
		>
			<span
				class="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-white shadow-sm"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<line x1="12" y1="5" x2="12" y2="19" />
					<line x1="5" y1="12" x2="19" y2="12" />
				</svg>
			</span>
			Nota
		</button>

		<!-- Fotos -->
		<button
			onclick={() => openSheet('photo')}
			class="flex flex-1 flex-col items-center gap-1 py-2.5 font-sans text-xs text-ink-muted transition-colors dark:text-dark-ink-muted"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.75"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path
					d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"
				/>
				<circle cx="12" cy="13" r="3" />
			</svg>
			Fotos
		</button>
	</div>
</nav>

<!-- Bottom sheet backdrop -->
{#if sheet}
	<button
		type="button"
		aria-label="Cerrar"
		class="fixed inset-0 z-20 bg-black/40 sm:hidden"
		onclick={close}
	></button>

	<div
		class="fixed inset-x-0 bottom-0 z-30 rounded-t-2xl border-t border-paper-border bg-paper pb-safe sm:hidden dark:border-dark-paper-border dark:bg-dark-paper"
	>
		<!-- Handle -->
		<div class="flex justify-center pt-3 pb-1">
			<div class="h-1 w-10 rounded-full bg-paper-border dark:bg-dark-paper-border"></div>
		</div>

		<div class="px-4 pb-2">
			<p class="font-sans text-sm font-medium text-ink dark:text-dark-ink">
				{sheet === 'note' ? '¿A qué proyecto añadir la nota?' : '¿A qué proyecto añadir la foto?'}
			</p>
		</div>

		{#if loading}
			<p class="px-4 py-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				Cargando proyectos…
			</p>
		{:else if projects.length === 0}
			<p class="px-4 py-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				No tienes proyectos aún.
			</p>
		{:else}
			<ul class="max-h-64 overflow-y-auto pb-2">
				{#each projects as p (p.id)}
					<li>
						<button
							onclick={() => sheet === 'note' ? createNote(p.id) : selectPhotoProject(p.id)}
							disabled={creating}
							class="w-full px-4 py-3 text-left font-sans text-sm text-ink transition-colors hover:bg-paper-ui disabled:opacity-50 dark:text-dark-ink dark:hover:bg-dark-paper-ui"
						>
							{p.title}
						</button>
					</li>
				{/each}
			</ul>
		{/if}

		{#if uploadError}
			<p class="px-4 pb-3 font-sans text-xs text-red-600">{uploadError}</p>
		{/if}
	</div>
{/if}
