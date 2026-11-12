<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { confirmDialog } from '$lib/stores/confirm.svelte';
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
		const ok = await confirmDialog({
			title: `Restore version ${compareDiff.current.versionNumber}?`,
			message:
				'It replaces the current draft. The draft you have now is kept under "Discarded text" until you close the tab.',
			confirmLabel: 'Restore'
		});
		if (!ok) return;
		await trpc.documents.restoreVersion.mutate({ documentId, versionId });
		onrestore(compareDiff.current.content);
		selectedVersionId = null;
		compareDiff = null;
	}
</script>

<div class="flex w-80 shrink-0 flex-col overflow-hidden border-l border-paper-border bg-paper">
	<div class="flex items-center justify-between border-b border-paper-border px-4 py-3">
		<h3 class="font-serif text-sm font-semibold text-ink">Version history</h3>
		<div class="flex items-center gap-2">
			{#if loadingVersions}
				<span class="font-sans text-xs text-ink-faint">Loading…</span>
			{/if}
			<button
				type="button"
				onclick={onclose}
				class="text-ink-faint transition-colors hover:text-ink-muted"
				aria-label="Close history"
			>
				<X size={14} strokeWidth={1.75} aria-hidden="true" />
			</button>
		</div>
	</div>

	<div class="flex-1 overflow-y-auto">
		{#if versions.length === 0 && !loadingVersions}
			<div class="px-4 py-8 text-center font-sans text-sm text-ink-muted">
				No saved versions yet.
			</div>
		{:else}
			<ul class="divide-y divide-paper-border">
				{#each versions as v (v.id)}
					<li class="px-4 py-3">
						<div class="flex items-start justify-between gap-2">
							<div class="min-w-0">
								<p class="font-sans text-xs font-semibold text-accent-ink">v{v.versionNumber}</p>
								<p class="mt-0.5 truncate font-sans text-sm text-ink">
									{v.changeDescription ?? 'No description'}
								</p>
								<p class="mt-0.5 font-sans text-xs text-ink-faint">
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
									class="rounded px-2 py-1 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-ui"
								>
									Compare ↗
								</button>
								{#if selectedVersionId === v.id && compareDiff !== null}
									<button
										onclick={() => restoreVersion(v.id)}
										class="rounded px-2 py-1 font-sans text-xs text-accent-ink transition-colors hover:underline"
									>
										Restore
									</button>
								{/if}
							</div>
						</div>

						{#if selectedVersionId === v.id}
							<div class="mt-3">
								{#if loadingCompare}
									<p class="font-sans text-xs text-ink-faint">Loading changes…</p>
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
