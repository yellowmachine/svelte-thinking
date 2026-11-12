<script lang="ts">
	import Book from '@lucide/svelte/icons/book';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import { confirmDialog } from '$lib/stores/confirm.svelte';
	import type { PageData } from './$types';
	import MarkdownPreview from '$lib/components/editor/MarkdownPreview.svelte';
	import DiffViewer from '$lib/components/editor/DiffViewer.svelte';
	import { trpc } from '$lib/utils/trpc';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import InfoDialog from '$lib/components/ui/InfoDialog.svelte';
	import SafeDeleteDialog from '$lib/components/ui/SafeDeleteDialog.svelte';
	import PublishToBlogDialog from '$lib/components/editor/PublishToBlogDialog.svelte';
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

	let actionsOpenId = $state<string | null>(null);
	let actionsMenuPos = $state({ top: 0, left: 0 });
	const actionsVersion = $derived(data.versions.find((v) => v.id === actionsOpenId) ?? null);

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
	let unpublishingBlogId = $state<string | null>(null);
	let showNoHandleDialog = $state(false);
	let versionToUnpublish = $state<Version | null>(null);
	let versionToPublish = $state<Version | null>(null);

	const fmt = new Intl.DateTimeFormat('en-GB', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});

	const fmtExpiry = new Intl.DateTimeFormat('en-GB', {
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

	function publishToBlog(v: Version) {
		if (!data.userHandle) {
			showNoHandleDialog = true;
			return;
		}
		versionToPublish = v;
	}

	function onPublished(result: { id: string; slug: string }) {
		if (!versionToPublish) return;
		blogPosts = { ...blogPosts, [versionToPublish.id]: { id: result.id, slug: result.slug } };
		versionToPublish = null;
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
		const ok = await confirmDialog({
			title: `Restore version ${v.versionNumber}?`,
			message: 'It replaces the current draft. Unsaved changes in the draft will be lost.',
			confirmLabel: 'Restore',
			danger: true
		});
		if (!ok) return;
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
	<title>History · {data.document.title} — Scholio</title>
</svelte:head>

<div class="flex h-screen flex-col bg-paper">
	<!-- Header -->
	<header
		class="sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b border-paper-border bg-paper/95 px-6 py-3 backdrop-blur-sm"
	>
		<a
			href={resolve(`/projects/${data.document.projectId}/documents/${data.document.id}`)}
			class="flex items-center gap-1.5 font-sans text-sm text-ink-muted transition-colors hover:text-ink"
		>
			<ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />
			<span translate="no">{data.document.title}</span>
		</a>
		<span class="text-ink-faint">/</span>
		<span class="font-sans text-sm font-medium text-ink">History</span>
		<span class="font-sans text-xs text-ink-faint">
			{data.versions.length}
			{data.versions.length === 1 ? 'version' : 'versions'}
		</span>

		{#if restoredVersion !== null}
			<span
				class="ml-auto rounded-md border border-success-border bg-success-bg px-2.5 py-1 font-sans text-xs text-success"
			>
				v{restoredVersion} restored as draft
			</span>
		{/if}
	</header>

	<div class="flex flex-1 overflow-hidden">
		<!-- Version list -->
		<aside
			class="flex w-72 shrink-0 flex-col overflow-hidden border-r border-paper-border bg-paper"
		>
			{#if data.versions.length === 0}
				<div class="px-6 py-12 text-center font-sans text-sm text-ink-muted">
					“There are no published versions yet.
				</div>
			{:else}
				<ul class="flex-1 divide-y divide-paper-border overflow-y-auto">
					{#each data.versions as v (v.id)}
						<li class="px-4 py-3 {selectedVersion?.id === v.id ? 'bg-paper-ui' : ''}">
							<div class="flex items-start justify-between gap-2">
								<div class="min-w-0">
									<p class="font-sans text-xs font-semibold text-accent-ink">v{v.versionNumber}</p>
									<p class="mt-0.5 truncate font-sans text-sm text-ink">
										{v.changeDescription ?? 'No description'}
									</p>
									<p class="mt-0.5 font-sans text-xs text-ink-faint">
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
										: 'text-ink-muted hover:bg-paper-ui'}"
								>
									View
								</button>
								<button
									onclick={() => selectVersion(v, 'diff')}
									class="rounded px-2 py-1 font-sans text-xs transition-colors {selectedVersion?.id ===
										v.id && panelMode === 'diff'
										? 'bg-accent text-white'
										: 'text-ink-muted hover:bg-paper-ui'}"
								>
									Diff
								</button>
								{#if v.aiSummary}
									<button
										onclick={() => selectVersion(v, 'summary')}
										class="rounded px-2 py-1 font-sans text-xs transition-colors {selectedVersion?.id ===
											v.id && panelMode === 'summary'
											? 'bg-accent text-white'
											: 'text-ink-muted hover:bg-paper-ui'}"
									>
										Summary
									</button>
								{/if}
								<button
									onclick={(e) => {
										const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
										actionsMenuPos = { top: rect.bottom + 4, left: rect.left };
										actionsOpenId = actionsOpenId === v.id ? null : v.id;
									}}
									title="More actions"
									aria-label="More actions"
									class="ml-auto flex h-6 w-6 items-center justify-center rounded text-ink-faint transition-colors hover:bg-paper-ui"
								>
									<svg
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="currentColor"
										aria-hidden="true"
									>
										<circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle
											cx="19"
											cy="12"
											r="2"
										/>
									</svg>
								</button>
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
					<p class="font-sans text-sm text-ink-faint">
						Select a version to view its contents or the diff.
					</p>
				</div>
			{:else if loading}
				<div class="flex h-full items-center justify-center">
					<p class="font-sans text-sm text-ink-faint">Loading...</p>
				</div>
			{:else if panelMode === 'preview' && versionContent !== null}
				<div class="mx-auto max-w-2xl px-6 py-10">
					<p class="mb-6 font-sans text-xs text-ink-faint">
						v{selectedVersion.versionNumber} · {selectedVersion.changeDescription ??
							'No description'}
					</p>
					<MarkdownPreview content={versionContent} projectId={data.document.projectId} />
				</div>
			{:else if panelMode === 'diff' && diffData !== null}
				<div class="p-6">
					<p class="mb-4 font-sans text-xs text-ink-faint">
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
					<p class="mb-4 font-sans text-xs text-ink-faint">
						v{selectedVersion.versionNumber} · AI summary
					</p>
					{#if summaryContent}
						<p class="font-sans text-sm leading-relaxed whitespace-pre-wrap text-ink">
							{summaryContent}
						</p>
					{:else}
						<p class="font-sans text-sm text-ink-faint">No summary available for this version.</p>
					{/if}
				</div>
			{/if}
		</main>
	</div>
</div>

{#if actionsVersion !== null}
	{@const v = actionsVersion}
	<button
		class="fixed inset-0 z-10"
		onclick={() => (actionsOpenId = null)}
		aria-label="Close menu"
		tabindex="-1"
	></button>
	<div
		class="fixed z-20 w-60 overflow-hidden rounded-xl border border-paper-border bg-paper py-1 shadow-lg"
		style="top: {actionsMenuPos.top}px; left: {actionsMenuPos.left}px;"
	>
		{#if data.canWrite}
			<button
				type="button"
				onclick={() => {
					restoreVersion(v);
					actionsOpenId = null;
				}}
				disabled={restoring}
				class="flex w-full items-center gap-2.5 px-4 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui disabled:opacity-40"
			>
				Restore as draft
			</button>
			<div class="my-1 border-t border-paper-border"></div>
		{/if}

		<a
			href={resolve(
				`/api/projects/${data.document.projectId}/documents/${data.document.id}/export?format=latex&versionId=${v.id}`
			)}
			onclick={() => (actionsOpenId = null)}
			class="flex items-center gap-2.5 px-4 py-2 font-sans text-sm text-ink-muted hover:bg-paper-ui"
		>
			<span class="font-mono text-xs text-ink-faint">.tex</span>LaTeX
		</a>
		<a
			href={resolve(
				`/api/projects/${data.document.projectId}/documents/${data.document.id}/export?format=typst&versionId=${v.id}`
			)}
			onclick={() => (actionsOpenId = null)}
			class="flex items-center gap-2.5 px-4 py-2 font-sans text-sm text-ink-muted hover:bg-paper-ui"
		>
			<span class="font-mono text-xs text-ink-faint">.typ</span>Typst
		</a>
		<a
			href={resolve(
				`/api/projects/${data.document.projectId}/documents/${data.document.id}/export?format=pdf&versionId=${v.id}`
			)}
			onclick={() => (actionsOpenId = null)}
			class="flex items-center gap-2.5 px-4 py-2 font-sans text-sm text-ink-muted hover:bg-paper-ui"
		>
			<span class="font-mono text-xs text-ink-faint">.pdf</span>PDF
		</a>

		{#if data.isOwner}
			<div class="my-1 border-t border-paper-border"></div>

			<button
				type="button"
				onclick={() => copyOrCreateShare(v)}
				disabled={sharingVersionId === v.id}
				class="flex w-full items-center gap-2.5 px-4 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui disabled:opacity-40"
			>
				{#if sharingVersionId === v.id}
					<Spinner size="sm" />
				{:else}
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
						class="shrink-0"
					>
						<rect x="9" y="2" width="6" height="4" rx="1" />
						<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
					</svg>
				{/if}
				{#if copiedVersionId === v.id}
					Copied ✓
				{:else if shares[v.id]}
					Copy public URL
				{:else}
					Create public URL
				{/if}
			</button>
			{#if shares[v.id]}
				<p class="px-4 pb-1 font-sans text-xs text-ink-faint">
					Expira {fmtExpiry.format(new Date(shares[v.id].expiresAt))}
				</p>
				<button
					type="button"
					onclick={() => {
						revokeShare(v);
						actionsOpenId = null;
					}}
					disabled={revokingShareId === shares[v.id]?.id}
					class="flex w-full items-center gap-2.5 px-4 py-2 font-sans text-sm text-danger transition-colors hover:bg-danger-bg disabled:opacity-40"
				>
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
						class="shrink-0"
					>
						<circle cx="12" cy="12" r="10" /><line x1="8" y1="12" x2="16" y2="12" />
					</svg>
					Revoke public URL
				</button>
			{/if}

			<div class="my-1 border-t border-paper-border"></div>

			{#if blogPosts[v.id]}
				<button
					type="button"
					onclick={() => {
						confirmUnpublishFromBlog(v);
						actionsOpenId = null;
					}}
					disabled={unpublishingBlogId === blogPosts[v.id]?.id}
					class="flex w-full items-center gap-2.5 px-4 py-2 font-sans text-sm text-accent-ink transition-colors hover:bg-accent/10 disabled:opacity-40"
				>
					<Book size={14} strokeWidth={1.75} class="shrink-0" aria-hidden="true" />
					Unpublish from blog
				</button>
			{:else}
				<button
					type="button"
					onclick={() => {
						publishToBlog(v);
						actionsOpenId = null;
					}}
					class="flex w-full items-center gap-2.5 px-4 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui disabled:opacity-40"
				>
					<Book size={14} strokeWidth={1.75} class="shrink-0" aria-hidden="true" />
					Publish to blog
				</button>
			{/if}
		{/if}
	</div>
{/if}

<InfoDialog
	open={showNoHandleDialog}
	title="Set up your blog first"
	message="You need to choose a handle in Settings → Blog before you can publish."
	actionLabel="Go to Settings"
	actionHref={resolve('/settings?tab=blog')}
	oncancel={() => (showNoHandleDialog = false)}
/>

<SafeDeleteDialog
	open={!!versionToUnpublish}
	title="Unpublish from blog"
	label="this version from the blog"
	confirmLabel="Unpublish"
	warning="The public URL will stop working. You can publish it again whenever you like."
	deleting={unpublishingBlogId === blogPosts[versionToUnpublish?.id ?? '']?.id}
	requireCode={false}
	onconfirm={unpublishFromBlog}
	oncancel={() => (versionToUnpublish = null)}
/>

{#if versionToPublish && data.userHandle}
	<PublishToBlogDialog
		title={data.document.title}
		handle={data.userHandle}
		versionId={versionToPublish.id}
		onpublished={onPublished}
		onclose={() => (versionToPublish = null)}
	/>
{/if}
