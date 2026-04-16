<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { trpc } from '$lib/utils/trpc';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Issue = (typeof data.issues)[number];
	type IssueStatus = Issue['status'];
	type IssuePriority = Issue['priority'];

	const issues = $derived(data.issues);

	// ── Filters ───────────────────────────────────────────────────────────────
	let statusFilter = $state<IssueStatus | 'all'>('all');

	const filtered = $derived(
		statusFilter === 'all' ? issues : issues.filter((i) => i.status === statusFilter)
	);

	const counts = $derived({
		all: issues.length,
		open: issues.filter((i) => i.status === 'open').length,
		in_progress: issues.filter((i) => i.status === 'in_progress').length,
		closed: issues.filter((i) => i.status === 'closed').length
	});

	// ── Create ────────────────────────────────────────────────────────────────
	let showCreate = $state(false);
	let newTitle = $state('');
	let creating = $state(false);

	async function createIssue() {
		const title = newTitle.trim();
		if (!title || creating) return;
		creating = true;
		try {
			const created = await trpc.issues.create.mutate({
				projectId: data.project.id,
				title
			});
			await goto(resolve(`/projects/${data.project.id}/issues/${created.id}`));
		} finally {
			creating = false;
		}
	}

	function onCreateKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') createIssue();
		if (e.key === 'Escape') {
			showCreate = false;
			newTitle = '';
		}
	}

	// ── Helpers ───────────────────────────────────────────────────────────────
	const STATUS_LABEL: Record<IssueStatus, string> = {
		open: 'Open',
		in_progress: 'In progress',
		closed: 'Closed'
	};

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

	function formatDate(d: Date) {
		return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
	}
</script>

<svelte:head>
	<title>Issues · {data.project.title}</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-4 py-8">
	<!-- Header -->
	<div class="mb-6 flex items-center justify-between gap-4">
		<div>
			<a
				href={resolve(`/projects/${data.project.id}`)}
				class="font-sans text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
			>
				← {data.project.title}
			</a>
			<h1 class="mt-1 font-sans text-xl font-semibold text-zinc-900 dark:text-zinc-100">Issues</h1>
		</div>
		<button
			type="button"
			onclick={() => { showCreate = true; }}
			class="rounded-md bg-zinc-900 px-3 py-1.5 font-sans text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
		>
			New issue
		</button>
	</div>

	<!-- Quick-create -->
	{#if showCreate}
		<div class="mb-4 flex items-center gap-2 rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
			<input
				type="text"
				bind:value={newTitle}
				onkeydown={onCreateKeydown}
				placeholder="Issue title…"
				class="min-w-0 flex-1 bg-transparent font-sans text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
			/>
			<button
				type="button"
				onclick={createIssue}
				disabled={!newTitle.trim() || creating}
				class="rounded px-2.5 py-1 font-sans text-sm font-medium text-white bg-zinc-900 hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
			>
				{creating ? 'Creating…' : 'Create'}
			</button>
			<button
				type="button"
				onclick={() => { showCreate = false; newTitle = ''; }}
				class="rounded px-2 py-1 font-sans text-sm text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
			>
				Cancel
			</button>
		</div>
	{/if}

	<!-- Status tabs -->
	<div class="mb-4 flex gap-1 border-b border-zinc-200 dark:border-zinc-700">
		{#each ([['all', 'All'], ['open', 'Open'], ['in_progress', 'In progress'], ['closed', 'Closed']] as const) as [val, label] (val)}
			<button
				type="button"
				onclick={() => { statusFilter = val; }}
				class="px-3 py-2 font-sans text-sm transition-colors {statusFilter === val
					? 'border-b-2 border-zinc-900 font-medium text-zinc-900 dark:border-zinc-100 dark:text-zinc-100'
					: 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'}"
			>
				{label}
				<span class="ml-1 text-xs text-zinc-400 dark:text-zinc-500">{counts[val]}</span>
			</button>
		{/each}
	</div>

	<!-- Issue list -->
	{#if filtered.length === 0}
		<p class="py-12 text-center font-sans text-sm text-zinc-400 dark:text-zinc-500">
			{statusFilter === 'all' ? 'No issues yet.' : `No ${STATUS_LABEL[statusFilter as IssueStatus].toLowerCase()} issues.`}
		</p>
	{:else}
		<ul class="divide-y divide-zinc-100 dark:divide-zinc-800">
			{#each filtered as iss (iss.id)}
				<li>
					<a
						href={resolve(`/projects/${data.project.id}/issues/${iss.id}`)}
						class="flex items-start gap-3 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/50 rounded-md px-2 -mx-2"
					>
						<!-- Status badge -->
						<span class="mt-0.5 shrink-0 rounded-full px-2 py-0.5 font-sans text-xs font-medium {STATUS_CLASS[iss.status]}">
							{STATUS_LABEL[iss.status]}
						</span>

						<!-- Title + meta -->
						<div class="min-w-0 flex-1">
							<p class="truncate font-sans text-sm font-medium text-zinc-900 dark:text-zinc-100">
								{iss.title}
							</p>
							<p class="mt-0.5 font-sans text-xs text-zinc-400 dark:text-zinc-500">
								{formatDate(iss.createdAt)}
								{#if iss.isPrivate}
									· <span class="text-zinc-400 dark:text-zinc-500">Private</span>
								{/if}
							</p>
						</div>

						<!-- Priority dot -->
						<span class="mt-1 shrink-0 font-sans text-xs font-semibold uppercase tracking-wide {PRIORITY_CLASS[iss.priority]}">
							{iss.priority}
						</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>
