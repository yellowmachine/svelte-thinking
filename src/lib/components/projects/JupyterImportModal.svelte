<script lang="ts">
	import { trpc } from '$lib/utils/trpc';

	type Props = {
		projectId: string;
		onimported: () => void;
		onclose: () => void;
	};

	let { projectId, onimported, onclose }: Props = $props();

	// ── Types ────────────────────────────────────────────────────────────────
	type Connection = { id: string; name: string; baseUrl: string; createdAt: Date };
	type NotebookEntry = { type: 'notebook'; name: string; path: string; lastModified: string };
	type DirectoryListing = { type: 'directory'; name: string; path: string };
	type ContentsItem = NotebookEntry | DirectoryListing;

	// ── View state ───────────────────────────────────────────────────────────
	// 'list'      → show saved connections
	// 'add'       → form to add a new connection
	// 'browse'    → file tree for a selected connection
	type View = 'list' | 'add' | 'browse';
	let view = $state<View>('list');

	// ── Connections ──────────────────────────────────────────────────────────
	let connections = $state<Connection[]>([]);
	let loadingConnections = $state(false);

	async function loadConnections() {
		loadingConnections = true;
		try {
			connections = (await trpc.jupyter.list.query()) as Connection[];
		} finally {
			loadingConnections = false;
		}
	}

	$effect(() => {
		loadConnections();
	});

	// ── Add connection form ──────────────────────────────────────────────────
	let addName = $state('');
	let addUrl = $state('');
	let addToken = $state('');
	let addError = $state('');
	let addSaving = $state(false);

	async function saveConnection() {
		addError = '';
		addSaving = true;
		try {
			await trpc.jupyter.add.mutate({
				name: addName.trim(),
				baseUrl: addUrl.trim(),
				token: addToken.trim()
			});
			await loadConnections();
			resetAddForm();
			view = 'list';
		} catch (err) {
			addError = err instanceof Error ? err.message : 'Error saving connection';
		} finally {
			addSaving = false;
		}
	}

	function resetAddForm() {
		addName = '';
		addUrl = '';
		addToken = '';
		addError = '';
	}

	// ── Browser ──────────────────────────────────────────────────────────────
	let selectedConn = $state<Connection | null>(null);
	let breadcrumbs = $state<{ name: string; path: string }[]>([]);
	let contentsItems = $state<ContentsItem[]>([]);
	let loadingContents = $state(false);
	let contentsError = $state('');

	async function browseConnection(conn: Connection) {
		selectedConn = conn;
		breadcrumbs = [];
		view = 'browse';
		await loadContents('');
	}

	async function loadContents(path: string) {
		if (!selectedConn) return;
		loadingContents = true;
		contentsError = '';
		try {
			const res = await fetch(
				`/api/jupyter/${selectedConn.id}/contents?path=${encodeURIComponent(path)}`
			);
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err.message ?? `Error ${res.status}`);
			}
			const data = (await res.json()) as { type: string; items?: ContentsItem[] };
			contentsItems = data.items ?? [];
		} catch (err) {
			contentsError = err instanceof Error ? err.message : 'Could not load contents';
		} finally {
			loadingContents = false;
		}
	}

	function navigateTo(path: string, name: string) {
		breadcrumbs =
			path === '' ? [] : [...breadcrumbs.filter((b) => b.path !== path), { name, path }];
		loadContents(path);
	}

	function navigateToCrumb(index: number) {
		if (index < 0) {
			breadcrumbs = [];
			loadContents('');
		} else {
			const crumb = breadcrumbs[index];
			breadcrumbs = breadcrumbs.slice(0, index + 1);
			loadContents(crumb.path);
		}
	}

	// ── Import ───────────────────────────────────────────────────────────────
	let importing = $state(''); // path of notebook being imported, '' = none
	let importError = $state('');

	async function importNotebook(path: string) {
		if (!selectedConn || importing) return;
		importing = path;
		importError = '';
		try {
			const res = await fetch(`/api/projects/${projectId}/notebooks/remote`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ connectionId: selectedConn.id, path })
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err.message ?? `Error ${res.status}`);
			}
			onimported();
			onclose();
		} catch (err) {
			importError = err instanceof Error ? err.message : 'Import failed';
		} finally {
			importing = '';
		}
	}

	// ── Keyboard ─────────────────────────────────────────────────────────────
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}

	const addValid = $derived(
		addName.trim().length > 0 && addUrl.trim().length > 0 && addToken.trim().length > 0
	);
</script>

<!-- Backdrop -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
	onclick={(e) => {
		if (e.target === e.currentTarget) onclose();
	}}
>
	<div
		role="dialog"
		aria-modal="true"
		aria-labelledby="jupyter-modal-title"
		tabindex="-1"
		onkeydown={handleKeydown}
		class="flex w-full max-w-lg flex-col rounded-xl border border-paper-border bg-paper shadow-xl dark:border-dark-paper-border dark:bg-dark-paper"
		style="max-height: 80vh;"
	>
		<!-- Header -->
		<div
			class="flex shrink-0 items-center justify-between gap-3 border-b border-paper-border px-5 py-4 dark:border-dark-paper-border"
		>
			<div class="flex items-center gap-2">
				{#if view === 'browse' || view === 'add'}
					<button
						onclick={() => {
							view = 'list';
							resetAddForm();
						}}
						class="mr-1 text-ink-faint transition-colors hover:text-ink dark:text-dark-ink-faint dark:hover:text-dark-ink"
						aria-label="Back"
					>
						<svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"
							><path
								fill-rule="evenodd"
								d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z"
								clip-rule="evenodd"
							/></svg
						>
					</button>
				{/if}
				<h2
					id="jupyter-modal-title"
					class="font-serif text-base font-semibold text-ink dark:text-dark-ink"
				>
					{#if view === 'add'}Add Jupyter connection
					{:else if view === 'browse' && selectedConn}{selectedConn.name}
					{:else}Import from Jupyter{/if}
				</h2>
			</div>
			<button
				onclick={onclose}
				class="text-ink-faint transition-colors hover:text-ink dark:text-dark-ink-faint dark:hover:text-dark-ink"
				aria-label="Close"
			>
				<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none"
					><path
						d="M18 6L6 18M6 6l12 12"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
					/></svg
				>
			</button>
		</div>

		<!-- Body -->
		<div class="min-h-0 flex-1 overflow-y-auto p-5">
			<!-- ── View: list ── -->
			{#if view === 'list'}
				{#if loadingConnections}
					<p class="font-sans text-sm text-ink-faint dark:text-dark-ink-faint">Loading…</p>
				{:else if connections.length === 0}
					<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
						No Jupyter connections yet. Add one to browse and import notebooks from a remote server.
					</p>
				{:else}
					<div class="mb-4 flex flex-col gap-1">
						{#each connections as conn (conn.id)}
							<button
								onclick={() => browseConnection(conn)}
								class="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-paper-ui dark:hover:bg-dark-paper-ui"
							>
								<div>
									<p class="font-sans text-sm font-medium text-ink dark:text-dark-ink">
										{conn.name}
									</p>
									<p class="font-mono text-xs text-ink-faint dark:text-dark-ink-faint">
										{conn.baseUrl}
									</p>
								</div>
								<svg
									class="h-4 w-4 shrink-0 text-ink-faint dark:text-dark-ink-faint"
									viewBox="0 0 20 20"
									fill="currentColor"
									><path
										fill-rule="evenodd"
										d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z"
										clip-rule="evenodd"
									/></svg
								>
							</button>
						{/each}
					</div>
				{/if}
				<button
					onclick={() => {
						view = 'add';
					}}
					class="w-full rounded-lg border border-dashed border-paper-border py-2.5 font-sans text-sm text-ink-muted transition-colors hover:border-ink-faint hover:text-ink dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:border-dark-ink-faint dark:hover:text-dark-ink"
				>
					+ Add connection
				</button>

				<!-- ── View: add ── -->
			{:else if view === 'add'}
				<div class="flex flex-col gap-4">
					<div>
						<label
							class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
							for="jup-name">Name</label
						>
						<input
							id="jup-name"
							bind:value={addName}
							type="text"
							placeholder="JupyterHub UCM"
							class="w-full rounded-lg border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink focus:ring-1 focus:ring-ink-faint focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
						/>
					</div>
					<div>
						<label
							class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
							for="jup-url">Server URL</label
						>
						<input
							id="jup-url"
							bind:value={addUrl}
							type="url"
							placeholder="https://jupyter.example.edu"
							class="w-full rounded-lg border border-paper-border bg-paper-ui px-3 py-2 font-mono text-sm text-ink focus:ring-1 focus:ring-ink-faint focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
						/>
					</div>
					<div>
						<label
							class="mb-1 block font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted"
							for="jup-token">API Token</label
						>
						<input
							id="jup-token"
							bind:value={addToken}
							type="password"
							placeholder="Token from JupyterHub → Settings → API Tokens"
							class="w-full rounded-lg border border-paper-border bg-paper-ui px-3 py-2 font-mono text-sm text-ink focus:ring-1 focus:ring-ink-faint focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
						/>
						<p class="mt-1 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
							Stored encrypted. Never shared.
						</p>
					</div>

					{#if addError}
						<p class="font-sans text-sm text-red-600 dark:text-red-400">{addError}</p>
					{/if}

					<button
						onclick={saveConnection}
						disabled={!addValid || addSaving}
						class="w-full rounded-lg bg-ink px-4 py-2 font-sans text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-40 dark:bg-dark-ink dark:text-dark-paper"
					>
						{addSaving ? 'Saving…' : 'Save connection'}
					</button>
				</div>

				<!-- ── View: browse ── -->
			{:else if view === 'browse'}
				<!-- Breadcrumbs -->
				<div
					class="mb-3 flex flex-wrap items-center gap-1 font-sans text-xs text-ink-faint dark:text-dark-ink-faint"
				>
					<button
						onclick={() => navigateToCrumb(-1)}
						class="hover:text-ink dark:hover:text-dark-ink"
					>
						root
					</button>
					{#each breadcrumbs as crumb, i}
						<svg class="h-3 w-3 shrink-0" viewBox="0 0 20 20" fill="currentColor"
							><path
								fill-rule="evenodd"
								d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z"
								clip-rule="evenodd"
							/></svg
						>
						<button
							onclick={() => navigateToCrumb(i)}
							class="hover:text-ink dark:hover:text-dark-ink"
						>
							{crumb.name}
						</button>
					{/each}
				</div>

				{#if importError}
					<p class="mb-2 font-sans text-sm text-red-600 dark:text-red-400">{importError}</p>
				{/if}

				{#if loadingContents}
					<p class="font-sans text-sm text-ink-faint dark:text-dark-ink-faint">Loading…</p>
				{:else if contentsError}
					<p class="font-sans text-sm text-red-600 dark:text-red-400">{contentsError}</p>
				{:else if contentsItems.length === 0}
					<p class="font-sans text-sm text-ink-faint dark:text-dark-ink-faint">Empty directory.</p>
				{:else}
					<div class="flex flex-col gap-0.5">
						{#each contentsItems as item (item.path)}
							{#if item.type === 'directory'}
								<button
									onclick={() => navigateTo(item.path, item.name)}
									class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-paper-ui dark:hover:bg-dark-paper-ui"
								>
									<svg
										class="h-4 w-4 shrink-0 text-ink-faint dark:text-dark-ink-faint"
										viewBox="0 0 20 20"
										fill="currentColor"
										><path
											d="M3.75 3A1.75 1.75 0 0 0 2 4.75v3.26a3.235 3.235 0 0 1 1.5-.01V4.75a.25.25 0 0 1 .25-.25h4.23l1.46 1.46c.14.14.328.22.524.22h5.28c.138 0 .25.112.25.25v9.5a.25.25 0 0 1-.25.25H3.75a.25.25 0 0 1-.25-.25V15H2v.75A1.75 1.75 0 0 0 3.75 17.5h12.5A1.75 1.75 0 0 0 18 15.75v-9.5A1.75 1.75 0 0 0 16.25 4.5H10.31L8.99 3.22A.75.75 0 0 0 8.465 3H3.75Z"
										/></svg
									>
									<span class="font-sans text-sm text-ink dark:text-dark-ink">{item.name}</span>
								</button>
							{:else}
								<div
									class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-paper-ui dark:hover:bg-dark-paper-ui"
								>
									<svg
										class="h-4 w-4 shrink-0 text-ink-faint dark:text-dark-ink-faint"
										viewBox="0 0 20 20"
										fill="currentColor"
										><path
											fill-rule="evenodd"
											d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-4.12-4.122A1.5 1.5 0 0 0 11.378 2H4.5Zm2.25 8.5a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Zm0 3a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Z"
											clip-rule="evenodd"
										/></svg
									>
									<span
										class="min-w-0 flex-1 truncate font-sans text-sm text-ink dark:text-dark-ink"
										>{item.name}</span
									>
									<button
										onclick={() => importNotebook(item.path)}
										disabled={!!importing}
										class="shrink-0 rounded-md border border-paper-border px-2.5 py-1 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-ui disabled:opacity-50 dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
									>
										{importing === item.path ? 'Importing…' : 'Import'}
									</button>
								</div>
							{/if}
						{/each}
					</div>
				{/if}
			{/if}
		</div>
	</div>
</div>
