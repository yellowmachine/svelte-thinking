<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import { trpc } from '$lib/utils/trpc';

	type Project = { id: string; title: string };

	let open = $state(false);
	let showSearch = $state(false);
	let searchQuery = $state('');
	let projects: Project[] = $state([]);
	let loading = $state(false);
	let creating = $state(false);

	const displayed = $derived(
		showSearch && searchQuery
			? projects.filter((p) => p.title.toLowerCase().includes(searchQuery.toLowerCase()))
			: projects.slice(0, 5)
	);

	async function toggle() {
		if (open) {
			close();
			return;
		}
		open = true;
		showSearch = false;
		searchQuery = '';
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
		open = false;
		showSearch = false;
		searchQuery = '';
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
</script>

<div
	class="relative"
	{@attach (node) => {
		function handleClick(e: MouseEvent) {
			if (open && !node.contains(e.target as Node)) close();
		}
		function handleKeydown(e: KeyboardEvent) {
			if (e.key === 'Escape') close();
		}
		window.addEventListener('click', handleClick);
		window.addEventListener('keydown', handleKeydown);
		return () => {
			window.removeEventListener('click', handleClick);
			window.removeEventListener('keydown', handleKeydown);
		};
	}}
>
	<button
		onclick={toggle}
		disabled={creating}
		class="flex items-center gap-1.5 rounded-md border border-accent/50 px-3 py-1.5 font-sans text-sm font-medium text-accent-ink transition-colors hover:bg-accent hover:text-white disabled:opacity-50"
	>
		<Plus size={14} strokeWidth={1.75} aria-hidden="true" />
		Quick note
	</button>

	{#if open}
		<div
			class="absolute top-full right-0 z-50 mt-1.5 w-60 rounded-xl border border-paper-border bg-paper shadow-lg"
		>
			{#if loading}
				<p class="px-4 py-3 font-sans text-sm text-ink-muted">Loading projects…</p>
			{:else if projects.length === 0}
				<div class="px-4 py-3">
					<p class="font-sans text-sm text-ink-muted">You have no projects yet.</p>
					<p class="mt-1 font-sans text-xs text-ink-faint">Create a project to get started.</p>
				</div>
			{:else}
				<ul class="py-1">
					{#each displayed as p (p.id)}
						<li>
							<button
								onclick={() => createNote(p.id)}
								disabled={creating}
								class="w-full px-4 py-2 text-left font-sans text-sm text-ink transition-colors hover:bg-paper-ui disabled:opacity-50"
							>
								<span translate="no">{p.title}</span>
							</button>
						</li>
					{/each}
					{#if displayed.length === 0 && showSearch}
						<li class="px-4 py-2 font-sans text-sm text-ink-muted">No results</li>
					{/if}
				</ul>

				{#if showSearch}
					<div class="border-t border-paper-border p-2">
						<!-- svelte-ignore a11y_autofocus -->
						<input
							autofocus
							bind:value={searchQuery}
							type="text"
							placeholder="Search project…"
							class="w-full rounded-md border border-paper-border bg-paper-ui px-3 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none"
						/>
					</div>
				{:else if projects.length > 5}
					<div class="border-t border-paper-border">
						<button
							onclick={() => (showSearch = true)}
							class="w-full px-4 py-2 text-left font-sans text-xs text-ink-muted transition-colors hover:text-ink"
						>
							Ver todos ({projects.length})…
						</button>
					</div>
				{/if}

				<div class="border-t border-paper-border px-4 py-2">
					<p class="font-sans text-[11px] text-ink-faint">
						Tip: name projects with <span class="font-mono">_quick</span> or
						<span class="font-mono">_math</span> to make them appear first.
					</p>
				</div>
			{/if}
		</div>
	{/if}
</div>
