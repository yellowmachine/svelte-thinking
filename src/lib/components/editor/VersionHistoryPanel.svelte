<script lang="ts">
	import { trpc } from '$lib/utils/trpc';
	import DiffViewer from './DiffViewer.svelte';

	type Version = {
		id: string;
		versionNumber: number;
		changeDescription: string | null;
		createdAt: Date;
	};

	type VersionDiff = {
		current: { id: string; versionNumber: number; content: string };
		previous: { id: string; versionNumber: number; content: string } | null;
	};

	let {
		documentId,
		projectId,
		onclose,
		onrestore
	}: {
		documentId: string;
		projectId: string;
		onclose: () => void;
		onrestore: (content: string) => void;
	} = $props();

	let versions = $state<Version[]>([]);
	let loadingVersions = $state(false);
	let selectedVersionId = $state<string | null>(null);
	let compareDiff = $state<VersionDiff | null>(null);
	let loadingCompare = $state(false);

	$effect(() => {
		loadVersions();
	});

	async function loadVersions() {
		loadingVersions = true;
		try {
			versions = await trpc.documents.versions.query(documentId);
		} finally {
			loadingVersions = false;
		}
	}

	async function restoreVersion(versionId: string) {
		if (!compareDiff) return;
		await trpc.documents.restoreVersion.mutate({ documentId, versionId });
		onrestore(compareDiff.current.content);
		selectedVersionId = null;
		compareDiff = null;
	}
</script>

<div
	class="flex w-80 shrink-0 flex-col overflow-hidden border-l border-paper-border bg-paper dark:border-dark-paper-border dark:bg-dark-paper"
>
	<div
		class="flex items-center justify-between border-b border-paper-border px-4 py-3 dark:border-dark-paper-border"
	>
		<h3 class="font-serif text-sm font-semibold text-ink dark:text-dark-ink">Version history</h3>
		<div class="flex items-center gap-2">
			{#if loadingVersions}
				<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">Cargando...</span>
			{/if}
			<button
				type="button"
				onclick={onclose}
				class="text-ink-faint transition-colors hover:text-ink-muted dark:text-dark-ink-faint dark:hover:text-dark-ink-muted"
				aria-label="Close history"
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M18 6L6 18M6 6l12 12"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
					/>
				</svg>
			</button>
		</div>
	</div>

	<div class="flex-1 overflow-y-auto">
		{#if versions.length === 0 && !loadingVersions}
			<div class="px-4 py-8 text-center font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				No saved versions yet.
			</div>
		{:else}
			<ul class="divide-y divide-paper-border dark:divide-dark-paper-border">
				{#each versions as v (v.id)}
					<li class="px-4 py-3">
						<div class="flex items-start justify-between gap-2">
							<div class="min-w-0">
								<p class="font-sans text-xs font-semibold text-accent">v{v.versionNumber}</p>
								<p class="mt-0.5 truncate font-sans text-sm text-ink dark:text-dark-ink">
									{v.changeDescription ?? 'No description'}
								</p>
								<p class="mt-0.5 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
									{new Intl.DateTimeFormat('es', {
										day: 'numeric',
										month: 'short',
										hour: '2-digit',
										minute: '2-digit'
									}).format(new Date(v.createdAt))}
								</p>
							</div>
							<div class="flex shrink-0 flex-col gap-1">
								<button
									onclick={() =>
										window.open(
											`/projects/${projectId}/documents/${documentId}/diff/${v.id}`,
											'_blank'
										)}
									class="rounded px-2 py-1 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
								>
									Compare ↗
								</button>
								{#if selectedVersionId === v.id && compareDiff !== null}
									<button
										onclick={() => restoreVersion(v.id)}
										class="rounded px-2 py-1 font-sans text-xs text-accent transition-colors hover:underline"
									>
										Restaurar
									</button>
								{/if}
							</div>
						</div>

						{#if selectedVersionId === v.id}
							<div class="mt-3">
								{#if loadingCompare}
									<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
										Cargando diff...
									</p>
								{:else if compareDiff !== null}
									<DiffViewer
										oldText={compareDiff.previous?.content ?? ''}
										newText={compareDiff.current.content}
										oldLabel={compareDiff.previous
											? `v${compareDiff.previous.versionNumber}`
											: '(empty)'}
										newLabel="v{v.versionNumber}"
									/>
								{/if}
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>
