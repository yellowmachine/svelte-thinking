<script lang="ts">
	import type { PageData } from './$types';
	import MarkdownPreview from '$lib/components/editor/MarkdownPreview.svelte';
	import DiffViewer from '$lib/components/editor/DiffViewer.svelte';
	import { trpc } from '$lib/utils/trpc';

	let { data }: { data: PageData } = $props();

	type PanelMode = 'preview' | 'diff';
	type Version = (typeof data.versions)[number];

	let selectedVersion = $state<Version | null>(null);
	let panelMode = $state<PanelMode>('diff');
	let loading = $state(false);
	let versionContent = $state<string | null>(null);
	let diffData = $state<{
		current: { versionNumber: number; content: string };
		previous: { versionNumber: number; content: string } | null;
	} | null>(null);
	let restoring = $state(false);
	let restoredVersion = $state<number | null>(null);

	const fmt = new Intl.DateTimeFormat('es', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});

	async function selectVersion(v: Version, mode: PanelMode) {
		if (selectedVersion?.id === v.id && panelMode === mode) {
			selectedVersion = null;
			versionContent = null;
			diffData = null;
			return;
		}
		selectedVersion = v;
		panelMode = mode;
		loading = true;
		versionContent = null;
		diffData = null;
		try {
			if (mode === 'preview') {
				const row = await trpc.documents.versionContent.query(v.id);
				versionContent = row.content;
			} else {
				diffData = await trpc.documents.versionDiff.query({
					documentId: data.document.id,
					versionId: v.id
				});
			}
		} finally {
			loading = false;
		}
	}

	async function restoreVersion(v: Version) {
		if (!confirm(`¿Restaurar v${v.versionNumber} como borrador? El draft actual se perderá.`))
			return;
		restoring = true;
		try {
			await trpc.documents.restoreVersion.mutate({
				documentId: data.document.id,
				versionId: v.id
			});
			restoredVersion = v.versionNumber;
		} finally {
			restoring = false;
		}
	}
</script>

<svelte:head>
	<title>Historial · {data.document.title} — Scholio</title>
</svelte:head>

<div class="flex h-screen flex-col bg-paper dark:bg-dark-paper">
	<!-- Header -->
	<header
		class="sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b border-paper-border bg-paper/95 px-6 py-3 backdrop-blur-sm dark:border-dark-paper-border dark:bg-dark-paper/95"
	>
		<a
			href="/projects/{data.document.projectId}/documents/{data.document.id}"
			class="flex items-center gap-1.5 font-sans text-sm text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
		>
			<svg
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M15 18l-6-6 6-6" />
			</svg>
			{data.document.title}
		</a>
		<span class="text-ink-faint dark:text-dark-ink-faint">/</span>
		<span class="font-sans text-sm font-medium text-ink dark:text-dark-ink">Historial</span>
		<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
			{data.versions.length}
			{data.versions.length === 1 ? 'version' : 'versions'}
		</span>

		{#if restoredVersion !== null}
			<span
				class="ml-auto rounded-md border border-green-300 bg-green-50 px-2.5 py-1 font-sans text-xs text-green-700 dark:border-green-700/50 dark:bg-green-900/20 dark:text-green-400"
			>
				v{restoredVersion} restored as draft
			</span>
		{/if}
	</header>

	<div class="flex flex-1 overflow-hidden">
		<!-- Version list -->
		<aside
			class="flex w-72 shrink-0 flex-col overflow-hidden border-r border-paper-border bg-paper dark:border-dark-paper-border dark:bg-dark-paper"
		>
			{#if data.versions.length === 0}
				<div
					class="px-6 py-12 text-center font-sans text-sm text-ink-muted dark:text-dark-ink-muted"
				>
					“There are no published versions yet.
				</div>
			{:else}
				<ul
					class="flex-1 divide-y divide-paper-border overflow-y-auto dark:divide-dark-paper-border"
				>
					{#each data.versions as v (v.id)}
						<li
							class="px-4 py-3 {selectedVersion?.id === v.id
								? 'bg-paper-ui dark:bg-dark-paper-ui'
								: ''}"
						>
							<div class="flex items-start justify-between gap-2">
								<div class="min-w-0">
									<p class="font-sans text-xs font-semibold text-accent">v{v.versionNumber}</p>
									<p class="mt-0.5 truncate font-sans text-sm text-ink dark:text-dark-ink">
										{v.changeDescription ?? 'Sin descripción'}
									</p>
									<p class="mt-0.5 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
										{fmt.format(new Date(v.createdAt))}
									</p>
								</div>
							</div>
							<div class="mt-2 flex items-center gap-1.5">
								<button
									onclick={() => selectVersion(v, 'preview')}
									class="rounded px-2 py-1 font-sans text-xs transition-colors {selectedVersion?.id ===
										v.id && panelMode === 'preview'
										? 'bg-accent text-white'
										: 'text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui'}"
								>
									View
								</button>
								<button
									onclick={() => selectVersion(v, 'diff')}
									class="rounded px-2 py-1 font-sans text-xs transition-colors {selectedVersion?.id ===
										v.id && panelMode === 'diff'
										? 'bg-accent text-white'
										: 'text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui'}"
								>
									Diff
								</button>
								{#if data.canWrite}
									<button
										onclick={() => restoreVersion(v)}
										disabled={restoring}
										class="ml-auto rounded px-2 py-1 font-sans text-xs text-ink-faint transition-colors hover:text-accent disabled:opacity-40 dark:text-dark-ink-faint dark:hover:text-accent"
									>
										Restore
									</button>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</aside>

		<!-- Main panel -->
		<main class="flex-1 overflow-y-auto">
			{#if selectedVersion === null}
				<div class="flex h-full items-center justify-center">
					<p class="font-sans text-sm text-ink-faint dark:text-dark-ink-faint">
						Select a version to view its contents or the diff.
					</p>
				</div>
			{:else if loading}
				<div class="flex h-full items-center justify-center">
					<p class="font-sans text-sm text-ink-faint dark:text-dark-ink-faint">Cargando...</p>
				</div>
			{:else if panelMode === 'preview' && versionContent !== null}
				<div class="mx-auto max-w-2xl px-6 py-10">
					<p class="mb-6 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
						v{selectedVersion.versionNumber} · {selectedVersion.changeDescription ??
							'Sin descripción'}
					</p>
					<MarkdownPreview content={versionContent} projectId={data.document.projectId} />
				</div>
			{:else if panelMode === 'diff' && diffData !== null}
				<div class="p-6">
					<p class="mb-4 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
						v{selectedVersion.versionNumber} · {selectedVersion.changeDescription ??
							'Sin descripción'}
					</p>
					<DiffViewer
						oldText={diffData.previous?.content ?? ''}
						newText={diffData.current.content}
						oldLabel={diffData.previous ? `v${diffData.previous.versionNumber}` : '(vacío)'}
						newLabel="v{diffData.current.versionNumber}"
					/>
				</div>
			{/if}
		</main>
	</div>
</div>
