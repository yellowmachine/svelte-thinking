<script lang="ts">
	import { goto, beforeNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { untrack } from 'svelte';
	import MarkdownEditor from '$lib/components/editor/MarkdownEditor.svelte';
	import MarkdownPreview from '$lib/components/editor/MarkdownPreview.svelte';
	import SafeDeleteDialog from '$lib/components/ui/SafeDeleteDialog.svelte';
	import { trpc } from '$lib/utils/trpc';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type IssueStatus = typeof data.issue.status;
	type IssuePriority = typeof data.issue.priority;

	// ── Persisted state (last saved values) ──────────────────────────────────
	let savedTitle = $state(untrack(() => data.issue.title));
	let savedContent = $state(untrack(() => data.issue.content ?? ''));

	// ── Edit-mode state ───────────────────────────────────────────────────────
	let editing = $state(false);
	let editTitle = $state('');
	let editContent = $state('');

	let status = $state<IssueStatus>(untrack(() => data.issue.status));
	let priority = $state<IssuePriority>(untrack(() => data.issue.priority));

	let saving = $state(false);
	let saveError = $state('');
	let showDeleteDialog = $state(false);
	let deleting = $state(false);

	const isDirty = $derived(
		editing && (editTitle.trim() !== savedTitle || editContent !== savedContent)
	);

	const canDelete = $derived(
		data.isOwner || (data.issue.isPrivate && data.issue.ownerUserId === data.currentUserId)
	);

	// ── Edit mode ─────────────────────────────────────────────────────────────
	function startEdit() {
		editTitle = savedTitle;
		editContent = savedContent;
		saveError = '';
		editing = true;
	}

	function cancelEdit() {
		editing = false;
		saveError = '';
	}

	async function save() {
		const trimmedTitle = editTitle.trim();
		if (!trimmedTitle) return;
		saving = true;
		saveError = '';
		try {
			await trpc.issues.update.mutate({
				id: data.issue.id,
				title: trimmedTitle,
				content: editContent || null
			});
			savedTitle = trimmedTitle;
			savedContent = editContent;
			data.issue.title = trimmedTitle;
			editing = false;
		} catch (e) {
			saveError = e instanceof Error ? e.message : 'Could not save.';
		} finally {
			saving = false;
		}
	}

	function onSaveKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 's') {
			e.preventDefault();
			save();
		}
	}

	// ── Status / Priority (any member) ────────────────────────────────────────
	async function updateStatus(val: IssueStatus) {
		status = val;
		await trpc.issues.update.mutate({ id: data.issue.id, status: val });
	}

	async function updatePriority(val: IssuePriority) {
		priority = val;
		await trpc.issues.update.mutate({ id: data.issue.id, priority: val });
	}

	// ── Delete ────────────────────────────────────────────────────────────────
	async function handleDelete() {
		deleting = true;
		try {
			await trpc.issues.delete.mutate(data.issue.id);
			await goto(resolve(`/projects/${data.projectId}/issues`));
		} finally {
			deleting = false;
		}
	}

	// ── Navigation guard ──────────────────────────────────────────────────────
	beforeNavigate(({ cancel }) => {
		if (isDirty) {
			const ok = confirm('You have unsaved changes. Leave anyway?');
			if (!ok) cancel();
		}
	});

	// ── Helpers ───────────────────────────────────────────────────────────────
	const STATUS_OPTIONS: { value: IssueStatus; label: string }[] = [
		{ value: 'open', label: 'Open' },
		{ value: 'in_progress', label: 'In progress' },
		{ value: 'closed', label: 'Closed' }
	];

	const PRIORITY_OPTIONS: { value: IssuePriority; label: string }[] = [
		{ value: 'low', label: 'Low' },
		{ value: 'medium', label: 'Medium' },
		{ value: 'high', label: 'High' },
		{ value: 'critical', label: 'Critical' }
	];

	const STATUS_CLASS: Record<IssueStatus, string> = {
		open: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
		in_progress: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
		closed: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
	};

	const PRIORITY_CLASS: Record<IssuePriority, string> = {
		low: 'text-zinc-400 dark:text-zinc-500',
		medium: 'text-sky-500 dark:text-sky-400',
		high: 'text-orange-500 dark:text-orange-400',
		critical: 'text-red-600 dark:text-red-400'
	};
</script>

<svelte:head>
	<title>{savedTitle} · {data.projectTitle}</title>
</svelte:head>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="mx-auto max-w-3xl px-4 py-8" onkeydown={editing ? onSaveKeydown : undefined}>
	<!-- Breadcrumb -->
	<div class="mb-6 flex items-center gap-2 font-sans text-sm text-zinc-500 dark:text-zinc-400">
		<a href={resolve(`/projects/${data.projectId}`)} class="hover:text-zinc-700 dark:hover:text-zinc-200">
			{data.projectTitle}
		</a>
		<span>/</span>
		<a href={resolve(`/projects/${data.projectId}/issues`)} class="hover:text-zinc-700 dark:hover:text-zinc-200">
			Issues
		</a>
	</div>

	<!-- Title -->
	<div class="mb-4">
		{#if editing}
			<input
				bind:value={editTitle}
				onkeydown={(e) => { if (e.key === 'Escape') cancelEdit(); }}
				class="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 font-sans text-2xl font-semibold text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-600 dark:text-zinc-100"
			/>
		{:else}
			<div class="flex items-start gap-2">
				<h1 class="flex-1 font-sans text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
					{savedTitle}
				</h1>
				{#if data.canEdit}
					<button
						type="button"
						onclick={startEdit}
						title="Edit issue"
						class="mt-1 shrink-0 rounded p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
							<path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
					</button>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Meta bar -->
	<div class="mb-6 flex flex-wrap items-center gap-3">
		<!-- Status selector (any member) -->
		<div class="flex items-center gap-1.5">
			<span class="font-sans text-xs text-zinc-400 dark:text-zinc-500">Status</span>
			<select
				value={status}
				onchange={(e) => updateStatus((e.currentTarget as HTMLSelectElement).value as IssueStatus)}
				class="rounded-full border-0 px-2.5 py-0.5 font-sans text-xs font-medium outline-none cursor-pointer {STATUS_CLASS[status]}"
			>
				{#each STATUS_OPTIONS as opt (opt.value)}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>
		</div>

		<span class="text-zinc-200 dark:text-zinc-700">|</span>

		<!-- Priority selector (any member) -->
		<div class="flex items-center gap-1.5">
			<span class="font-sans text-xs text-zinc-400 dark:text-zinc-500">Priority</span>
			<select
				value={priority}
				onchange={(e) => updatePriority((e.currentTarget as HTMLSelectElement).value as IssuePriority)}
				class="bg-transparent font-sans text-xs font-semibold uppercase tracking-wide outline-none cursor-pointer {PRIORITY_CLASS[priority]}"
			>
				{#each PRIORITY_OPTIONS as opt (opt.value)}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>
		</div>

		{#if data.issue.isPrivate}
			<span class="rounded-full bg-zinc-100 px-2 py-0.5 font-sans text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
				Private
			</span>
		{/if}

		<div class="ml-auto flex items-center gap-2">
			{#if editing}
				<button
					type="button"
					onclick={cancelEdit}
					disabled={saving}
					class="rounded-md px-3 py-1.5 font-sans text-sm text-zinc-500 transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800"
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={save}
					disabled={saving || !isDirty || !editTitle.trim()}
					class="rounded-md bg-zinc-900 px-3 py-1.5 font-sans text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
				>
					{saving ? 'Saving…' : 'Save'}
				</button>
			{:else if canDelete}
				<button
					type="button"
					onclick={() => { showDeleteDialog = true; }}
					class="font-sans text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
				>
					Delete
				</button>
			{/if}
		</div>
	</div>

	{#if saveError}
		<p class="mb-4 font-sans text-sm text-red-500">{saveError}</p>
	{/if}

	<!-- Content -->
	{#if editing}
		<div class="rounded-lg border border-zinc-200 dark:border-zinc-700">
			<MarkdownEditor
				value={editContent}
				ondocchange={(val) => { editContent = val; }}
			/>
		</div>
		<p class="mt-2 font-sans text-xs text-zinc-400 dark:text-zinc-500">
			⌘S / Ctrl+S to save
		</p>
	{:else if savedContent}
		<div class="prose prose-zinc max-w-none dark:prose-invert">
			<MarkdownPreview content={savedContent} />
		</div>
	{:else if data.canEdit}
		<button
			type="button"
			onclick={startEdit}
			class="w-full rounded-lg border border-dashed border-zinc-300 px-4 py-8 font-sans text-sm text-zinc-400 transition-colors hover:border-zinc-400 hover:text-zinc-600 dark:border-zinc-700 dark:text-zinc-500 dark:hover:border-zinc-500 dark:hover:text-zinc-400"
		>
			Add a description…
		</button>
	{:else}
		<p class="font-sans text-sm text-zinc-400 dark:text-zinc-500">No description.</p>
	{/if}
</div>

<SafeDeleteDialog
	open={showDeleteDialog}
	label="this issue"
	warning="The issue and its content will be permanently deleted."
	deleting={deleting}
	onconfirm={handleDelete}
	oncancel={() => { showDeleteDialog = false; }}
/>
