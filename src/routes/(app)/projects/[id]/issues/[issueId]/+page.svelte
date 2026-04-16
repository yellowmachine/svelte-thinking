<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { untrack } from 'svelte';
	import MarkdownEditor from '$lib/components/editor/MarkdownEditor.svelte';
	import SafeDeleteDialog from '$lib/components/ui/SafeDeleteDialog.svelte';
	import { trpc } from '$lib/utils/trpc';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type IssueStatus = typeof data.issue.status;
	type IssuePriority = typeof data.issue.priority;

	// ── Local state ───────────────────────────────────────────────────────────
	let title = $state(untrack(() => data.issue.title));
	let status = $state<IssueStatus>(untrack(() => data.issue.status));
	let priority = $state<IssuePriority>(untrack(() => data.issue.priority));
	let content = $state(untrack(() => data.issue.content ?? ''));

	let editingTitle = $state(false);
	let titleError = $state('');
	let titleInputEl = $state<HTMLInputElement | null>(null);

	$effect(() => {
		if (editingTitle) titleInputEl?.select();
	});

	let saving = $state(false);
	let saveTimer: ReturnType<typeof setTimeout> | null = null;
	let showDeleteDialog = $state(false);
	let deleting = $state(false);

	// Can delete: owner always; creator can delete their own private issue
	const canDelete = $derived(
		data.isOwner || (data.issue.isPrivate && data.issue.ownerUserId === data.currentUserId)
	);

	// ── Title ─────────────────────────────────────────────────────────────────
	function startEditTitle() {
		editingTitle = true;
		titleError = '';
	}

	async function commitTitle() {
		const trimmed = title.trim();
		if (!trimmed || trimmed === data.issue.title) {
			editingTitle = false;
			title = data.issue.title;
			return;
		}
		try {
			await trpc.issues.update.mutate({ id: data.issue.id, title: trimmed });
			data.issue.title = trimmed;
			editingTitle = false;
			titleError = '';
		} catch (e) {
			titleError = e instanceof Error ? e.message : 'Could not rename issue.';
		}
	}

	function onTitleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') { e.preventDefault(); commitTitle(); }
		if (e.key === 'Escape') { editingTitle = false; title = data.issue.title; }
	}

	// ── Status / Priority ─────────────────────────────────────────────────────
	async function updateStatus(val: IssueStatus) {
		status = val;
		await trpc.issues.update.mutate({ id: data.issue.id, status: val });
	}

	async function updatePriority(val: IssuePriority) {
		priority = val;
		await trpc.issues.update.mutate({ id: data.issue.id, priority: val });
	}

	// ── Content (debounced auto-save) ─────────────────────────────────────────
	function onContentChange(val: string) {
		content = val;
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(async () => {
			saving = true;
			try {
				await trpc.issues.update.mutate({ id: data.issue.id, content: val });
			} finally {
				saving = false;
			}
		}, 1500);
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
	<title>{data.issue.title} · {data.projectTitle}</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-4 py-8">
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
		{#if editingTitle}
			<input
				bind:this={titleInputEl}
				bind:value={title}
				onkeydown={onTitleKeydown}
				onblur={commitTitle}
				class="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 font-sans text-2xl font-semibold text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-600 dark:text-zinc-100"
			/>
			{#if titleError}
				<p class="mt-1 font-sans text-xs text-red-500">{titleError}</p>
			{/if}
		{:else}
			<button
				type="button"
				onclick={startEditTitle}
				class="text-left font-sans text-2xl font-semibold text-zinc-900 hover:text-zinc-600 dark:text-zinc-100 dark:hover:text-zinc-300"
			>
				{title}
			</button>
		{/if}
	</div>

	<!-- Meta bar: status · priority · save indicator -->
	<div class="mb-6 flex flex-wrap items-center gap-3">
		<!-- Status selector -->
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

		<!-- Priority selector -->
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

		<span class="ml-auto font-sans text-xs text-zinc-400 dark:text-zinc-500">
			{saving ? 'Saving…' : 'Saved'}
		</span>

		{#if canDelete}
			<button
				type="button"
				onclick={() => { showDeleteDialog = true; }}
				class="font-sans text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
			>
				Delete
			</button>
		{/if}
	</div>

	<!-- Content editor -->
	<div class="rounded-lg border border-zinc-200 dark:border-zinc-700">
		<MarkdownEditor
			value={content}
			ondocchange={onContentChange}
		/>
	</div>
</div>

<SafeDeleteDialog
	open={showDeleteDialog}
	label="this issue"
	warning="The issue and its content will be permanently deleted."
	deleting={deleting}
	onconfirm={handleDelete}
	oncancel={() => { showDeleteDialog = false; }}
/>
