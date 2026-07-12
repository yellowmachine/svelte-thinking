<script lang="ts">
	import type { PageData } from './$types';
	import MarkdownPreview from '$lib/components/editor/MarkdownPreview.svelte';
	import DiffViewer from '$lib/components/editor/DiffViewer.svelte';
	import { trpc } from '$lib/utils/trpc';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import InfoDialog from '$lib/components/ui/InfoDialog.svelte';
	import SafeDeleteDialog from '$lib/components/ui/SafeDeleteDialog.svelte';
	import { untrack } from 'svelte';

	import { resolve } from '$app/paths';
	let { data }: { data: PageData } = $props();

	type PanelMode = 'preview' | 'diff' | 'summary';
	type Version = (typeof data.versions)[number];

	let selectedVersion = $state<Version | null>(null);
	let panelMode = $state<PanelMode>('diff');
	let loading = $state(false);
	let versionContent = $state<string | null>(null);
	let summaryContent = $state<string | null>(null);
	let diffData = $state<{
		current: { versionNumber: number; content: string };
		previous: { versionNumber: number; content: string } | null;
	} | null>(null);
	let restoring = $state(false);
	let restoredVersion = $state<number | null>(null);

	let exportOpenId = $state<string | null>(null);
	let exportMenuPos = $state({ top: 0, left: 0 });

	// Shares: mapa versionId → share (reactivo para actualizaciones optimistas)
	// untrack: sólo queremos el valor inicial del server load, lo gestionamos manualmente
	let shares = $state<Record<string, { id: string; token: string; expiresAt: Date }>>(
		untrack(() => ({ ...data.sharesByVersionId }))
	);
	let sharingVersionId = $state<string | null>(null);
	let revokingShareId = $state<string | null>(null);
	let copiedVersionId = $state<string | null>(null);

	// Blog posts: mapa versionId → post publicado (reactivo)
	let blogPosts = $state<Record<string, { id: string; slug: string }>>(
		untrack(() => ({ ...data.blogPostByVersionId }))
	);
	let publishingVersionId = $state<string | null>(null);
	let unpublishingBlogId = $state<string | null>(null);
	let showNoHandleDialog = $state(false);
	let versionToUnpublish = $state<Version | null>(null);

	const fmt = new Intl.DateTimeFormat('es', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});

	const fmtExpiry = new Intl.DateTimeFormat('es', {
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	});

	function previewUrl(token: string): string {
		const origin = typeof window !== 'undefined' ? window.location.origin : '';
		return `${origin}/preview/${token}`;
	}

	async function copyOrCreateShare(v: Version) {
		const existing = shares[v.id];
		let token: string;

		if (existing) {
			token = existing.token;
		} else {
			sharingVersionId = v.id;
			try {
				const result = await trpc.versionShares.create.mutate({ versionId: v.id });
				shares = {
					...shares,
					[v.id]: { id: result.id, token: result.token, expiresAt: result.expiresAt }
				};
				token = result.token;
			} finally {
				sharingVersionId = null;
			}
		}

		await navigator.clipboard.writeText(previewUrl(token));
		copiedVersionId = v.id;
		setTimeout(() => {
			copiedVersionId = null;
		}, 2000);
	}

	async function revokeShare(v: Version) {
		const share = shares[v.id];
		if (!share?.id) return;
		revokingShareId = share.id;
		try {
			await trpc.versionShares.revoke.mutate({ shareId: share.id });
			const next = { ...shares };
			delete next[v.id];
			shares = next;
		} finally {
			revokingShareId = null;
		}
	}

	async function publishToBlog(v: Version) {
		if (!data.userHandle) {
			showNoHandleDialog = true;
			return;
		}
		publishingVersionId = v.id;
		try {
			const result = await trpc.blog.publish.mutate({ versionId: v.id });
			blogPosts = { ...blogPosts, [v.id]: { id: result.id, slug: result.slug } };
		} finally {
			publishingVersionId = null;
		}
	}

	function confirmUnpublishFromBlog(v: Version) {
		versionToUnpublish = v;
	}

	async function unpublishFromBlog() {
		const v = versionToUnpublish;
		if (!v) return;
		const post = blogPosts[v.id];
		if (!post?.id) return;
		unpublishingBlogId = post.id;
		try {
			await trpc.blog.unpublish.mutate({ postId: post.id });
			const next = { ...blogPosts };
			delete next[v.id];
			blogPosts = next;
		} finally {
			unpublishingBlogId = null;
			versionToUnpublish = null;
		}
	}

	async function selectVersion(v: Version, mode: PanelMode) {
		if (selectedVersion?.id === v.id && panelMode === mode) {
			selectedVersion = null;
			versionContent = null;
			diffData = null;
			summaryContent = null;
			return;
		}
		selectedVersion = v;
		panelMode = mode;
		versionContent = null;
		diffData = null;
		summaryContent = null;
		if (mode === 'summary') {
			summaryContent = v.aiSummary ?? null;
			return;
		}
		loading = true;
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
			href={resolve(`/projects/${data.document.projectId}/documents/${data.document.id}`)}
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
			<span translate="no">{data.document.title}</span>
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
										{v.changeDescription ?? 'No description'}
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
								{#if v.aiSummary}
									<button
										onclick={() => selectVersion(v, 'summary')}
										class="rounded px-2 py-1 font-sans text-xs transition-colors {selectedVersion?.id ===
											v.id && panelMode === 'summary'
											? 'bg-accent text-white'
											: 'text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui'}"
									>
										Summary
									</button>
								{/if}
								{#if data.canWrite}
									<button
										onclick={() => restoreVersion(v)}
										disabled={restoring}
										class="rounded px-2 py-1 font-sans text-xs text-ink-faint transition-colors hover:text-accent disabled:opacity-40 dark:text-dark-ink-faint dark:hover:text-accent"
									>
										Restore
									</button>
								{/if}

								<button
									onclick={(e) => {
										const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
										exportMenuPos = { top: rect.bottom + 4, left: rect.left };
										exportOpenId = exportOpenId === v.id ? null : v.id;
									}}
									class="rounded px-2 py-1 font-sans text-xs text-ink-faint transition-colors hover:bg-paper-ui dark:text-dark-ink-faint dark:hover:bg-dark-paper-ui"
								>
									Export
								</button>

								{#if data.isOwner}
									<div class="ml-auto flex items-center gap-1">
										<!-- Botón copiar URL (gris = sin share, azul = con share activo) -->
										<button
											onclick={() => copyOrCreateShare(v)}
											disabled={sharingVersionId === v.id}
											title={shares[v.id]
												? `URL activa · expira ${fmtExpiry.format(new Date(shares[v.id].expiresAt))}\nClick para copiar`
												: 'Crear URL pública para esta versión'}
											class="flex h-6 w-6 items-center justify-center rounded transition-colors disabled:opacity-40
												{shares[v.id]
												? 'text-accent hover:bg-accent/10'
												: 'text-ink-faint hover:bg-paper-ui dark:text-dark-ink-faint dark:hover:bg-dark-paper-ui'}"
											aria-label={shares[v.id] ? 'Copiar URL pública' : 'Crear URL pública'}
										>
											{#if copiedVersionId === v.id}
												<!-- Check de confirmación -->
												<svg
													width="13"
													height="13"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													stroke-width="2.5"
													stroke-linecap="round"
													stroke-linejoin="round"
													aria-hidden="true"
												>
													<polyline points="20 6 9 17 4 12" />
												</svg>
											{:else if sharingVersionId === v.id}
												<Spinner size="sm" />
											{:else}
												<!-- Clipboard -->
												<svg
													width="13"
													height="13"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													stroke-width="2"
													stroke-linecap="round"
													stroke-linejoin="round"
													aria-hidden="true"
												>
													<rect x="9" y="2" width="6" height="4" rx="1" />
													<path
														d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"
													/>
												</svg>
											{/if}
										</button>

										<!-- Botón revocar (solo si hay share activo) -->
										{#if shares[v.id]}
											<button
												onclick={() => revokeShare(v)}
												disabled={revokingShareId === shares[v.id]?.id}
												title="Revocar URL pública"
												class="flex h-6 w-6 items-center justify-center rounded text-red-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-900/20"
												aria-label="Revocar URL pública"
											>
												<svg
													width="12"
													height="12"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													stroke-width="2"
													stroke-linecap="round"
													stroke-linejoin="round"
													aria-hidden="true"
												>
													<circle cx="12" cy="12" r="10" />
													<line x1="8" y1="12" x2="16" y2="12" />
												</svg>
											</button>
										{/if}

										<!-- Publicar / despublicar en el blog -->
										{#if blogPosts[v.id]}
											<button
												onclick={() => confirmUnpublishFromBlog(v)}
												disabled={unpublishingBlogId === blogPosts[v.id]?.id}
												title="Publicado en el blog · click para despublicar"
												class="flex h-6 w-6 items-center justify-center rounded text-accent transition-colors hover:bg-accent/10 disabled:opacity-40"
												aria-label="Despublicar del blog"
											>
												{#if unpublishingBlogId === blogPosts[v.id]?.id}
													<Spinner size="sm" />
												{:else}
													<svg
														width="13"
														height="13"
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														stroke-width="2"
														stroke-linecap="round"
														stroke-linejoin="round"
														aria-hidden="true"
													>
														<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
														<path
															d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"
														/>
													</svg>
												{/if}
											</button>
										{:else}
											<button
												onclick={() => publishToBlog(v)}
												disabled={publishingVersionId === v.id}
												title="Publicar esta versión en tu blog"
												class="flex h-6 w-6 items-center justify-center rounded text-ink-faint transition-colors hover:bg-paper-ui disabled:opacity-40 dark:text-dark-ink-faint dark:hover:bg-dark-paper-ui"
												aria-label="Publicar en el blog"
											>
												{#if publishingVersionId === v.id}
													<Spinner size="sm" />
												{:else}
													<svg
														width="13"
														height="13"
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														stroke-width="2"
														stroke-linecap="round"
														stroke-linejoin="round"
														aria-hidden="true"
													>
														<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
														<path
															d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"
														/>
													</svg>
												{/if}
											</button>
										{/if}
									</div>
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
					<p class="font-sans text-sm text-ink-faint dark:text-dark-ink-faint">Loading...</p>
				</div>
			{:else if panelMode === 'preview' && versionContent !== null}
				<div class="mx-auto max-w-2xl px-6 py-10">
					<p class="mb-6 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
						v{selectedVersion.versionNumber} · {selectedVersion.changeDescription ??
							'No description'}
					</p>
					<MarkdownPreview content={versionContent} projectId={data.document.projectId} />
				</div>
			{:else if panelMode === 'diff' && diffData !== null}
				<div class="p-6">
					<p class="mb-4 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
						v{selectedVersion.versionNumber} · {selectedVersion.changeDescription ??
							'No description'}
					</p>
					<DiffViewer
						oldText={diffData.previous?.content ?? ''}
						newText={diffData.current.content}
						oldLabel={diffData.previous ? `v${diffData.previous.versionNumber}` : '(empty)'}
						newLabel="v{diffData.current.versionNumber}"
					/>
				</div>
			{:else if panelMode === 'summary'}
				<div class="mx-auto max-w-2xl px-6 py-10">
					<p class="mb-4 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
						v{selectedVersion.versionNumber} · AI summary
					</p>
					{#if summaryContent}
						<p
							class="font-sans text-sm leading-relaxed whitespace-pre-wrap text-ink dark:text-dark-ink"
						>
							{summaryContent}
						</p>
					{:else}
						<p class="font-sans text-sm text-ink-faint dark:text-dark-ink-faint">
							No summary available for this version.
						</p>
					{/if}
				</div>
			{/if}
		</main>
	</div>
</div>

{#if exportOpenId !== null}
	<button
		class="fixed inset-0 z-10"
		onclick={() => (exportOpenId = null)}
		aria-label="Close menu"
		tabindex="-1"
	></button>
	<div
		class="fixed z-20 w-44 overflow-hidden rounded-xl border border-paper-border bg-paper shadow-lg dark:border-dark-paper-border dark:bg-dark-paper"
		style="top: {exportMenuPos.top}px; left: {exportMenuPos.left}px;"
	>
		<a
			href={resolve(
				`/api/projects/${data.document.projectId}/documents/${data.document.id}/export?format=latex&versionId=${exportOpenId}`
			)}
			onclick={() => (exportOpenId = null)}
			class="flex items-center gap-2.5 px-4 py-2.5 font-sans text-sm text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
		>
			<span class="font-mono text-xs text-ink-faint dark:text-dark-ink-faint">.tex</span>LaTeX
		</a>
		<a
			href={resolve(
				`/api/projects/${data.document.projectId}/documents/${data.document.id}/export?format=typst&versionId=${exportOpenId}`
			)}
			onclick={() => (exportOpenId = null)}
			class="flex items-center gap-2.5 px-4 py-2.5 font-sans text-sm text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
		>
			<span class="font-mono text-xs text-ink-faint dark:text-dark-ink-faint">.typ</span>Typst
		</a>
		<a
			href={resolve(
				`/api/projects/${data.document.projectId}/documents/${data.document.id}/export?format=pdf&versionId=${exportOpenId}`
			)}
			onclick={() => (exportOpenId = null)}
			class="flex items-center gap-2.5 px-4 py-2.5 font-sans text-sm text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
		>
			<span class="font-mono text-xs text-ink-faint dark:text-dark-ink-faint">.pdf</span>PDF
		</a>
	</div>
{/if}

<InfoDialog
	open={showNoHandleDialog}
	title="Configura tu blog primero"
	message="Necesitas elegir un handle en Ajustes → Blog antes de poder publicar."
	actionLabel="Ir a Ajustes"
	actionHref={resolve('/settings?tab=blog')}
	oncancel={() => (showNoHandleDialog = false)}
/>

<SafeDeleteDialog
	open={!!versionToUnpublish}
	title="Despublicar del blog"
	label="esta versión del blog"
	confirmLabel="Despublicar"
	warning="La URL pública dejará de funcionar. Puedes volver a publicarla cuando quieras."
	deleting={unpublishingBlogId === blogPosts[versionToUnpublish?.id ?? '']?.id}
	requireCode={false}
	onconfirm={unpublishFromBlog}
	oncancel={() => (versionToUnpublish = null)}
/>
