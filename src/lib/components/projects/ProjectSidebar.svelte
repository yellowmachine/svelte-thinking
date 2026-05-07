<script lang="ts">
	import { untrack } from 'svelte';
	import { invalidateAll, goto } from '$app/navigation';
	import InviteCollaborator from '$lib/components/projects/InviteCollaborator.svelte';
	import ContextPickerModal from '$lib/components/projects/ContextPickerModal.svelte';
	import SafeDeleteDialog from '$lib/components/ui/SafeDeleteDialog.svelte';
	import RequirementsProgress from '$lib/components/projects/RequirementsProgress.svelte';
	import { trpc } from '$lib/utils/trpc';
	import { type CitationStyle, CITATION_STYLE_LABELS } from '$lib/utils/citations';

	type Collaborator = {
		id: string;
		userId: string;
		role: 'author' | 'coauthor' | 'reviewer' | 'commenter';
		name: string;
		email: string;
	};

	type Invitation = {
		id: string;
		invitedEmail: string;
		role: 'author' | 'coauthor' | 'reviewer' | 'commenter';
		status: string;
		expiresAt: Date;
	};

	type Project = {
		id: string;
		citationStyle?: string | null;
		doi?: string | null;
		version?: string | null;
		publishedAt?: Date | null;
		isSearchable?: boolean;
	};

	type RequirementCounts = {
		fulfilled: number;
		total: number;
		requiredFulfilled: number;
		requiredTotal: number;
	};

	type ContextLink = {
		id: string;
		linkedDocumentId: string;
		docTitle: string;
		docType: string;
		sourceProjectId: string;
		sourceProjectTitle: string;
	};

	type InterestedUser = {
		id: string;
		userId: string;
		name: string;
		displayName: string | null;
		institution: string | null;
		orcid: string | null;
		bio: string | null;
		createdAt: Date;
	};

	let {
		isOwner,
		canEdit,
		canUploadS3,
		s3CtaType,
		requirementCounts,
		collaborators,
		invitations,
		project
	}: {
		isOwner: boolean;
		canEdit: boolean;
		canUploadS3: boolean;
		s3CtaType: 'ok' | 'personal' | 'org-owner' | 'org-member';
		requirementCounts: RequirementCounts;
		collaborators: Collaborator[];
		invitations: Invitation[];
		project: Project;
	} = $props();

	// ── Click-to-edit (publication metadata) ─────────────────────────────────
	type PubField = 'doi' | 'version' | 'publishedAt';
	let editingField = $state<PubField | null>(null);
	let editBuffer = $state('');
	let savingField = $state(false);

	function focusEl(node: HTMLElement) {
		node.focus();
	}

	function startEdit(field: PubField) {
		if (!isOwner) return;
		editBuffer =
			field === 'doi'
				? (project.doi ?? '')
				: field === 'version'
					? (project.version ?? '')
					: field === 'publishedAt'
						? project.publishedAt
							? project.publishedAt.toISOString().slice(0, 10)
							: ''
						: '';
		editingField = field;
	}

	function cancelEdit() {
		editingField = null;
	}

	async function saveField(field: PubField) {
		if (savingField) return;
		savingField = true;
		try {
			await trpc.projects.update.mutate({
				id: project.id,
				...(field === 'doi' ? { doi: editBuffer.trim() || null } : {}),
				...(field === 'version' ? { version: editBuffer.trim() || null } : {}),
				...(field === 'publishedAt'
					? { publishedAt: editBuffer ? new Date(editBuffer) : null }
					: {})
			});
			await invalidateAll();
		} catch {
			// revert silently
		} finally {
			savingField = false;
			editingField = null;
		}
	}

	async function setProjectCitationStyle(style: CitationStyle | null) {
		await trpc.projects.update.mutate({ id: project.id, citationStyle: style });
		await invalidateAll();
	}

	// ── Context links ─────────────────────────────────────────────────────────
	let contextLinks = $state<ContextLink[]>([]);
	let showContextPicker = $state(false);

	async function loadContextLinks() {
		try {
			contextLinks = await trpc.contextLinks.list.query(project.id);
		} catch {
			/* non-critical */
		}
	}

	async function addContextLink(docId: string) {
		await trpc.contextLinks.add.mutate({ projectId: project.id, documentId: docId });
		await loadContextLinks();
	}

	async function removeContextLink(linkId: string) {
		await trpc.contextLinks.remove.mutate(linkId);
		contextLinks = contextLinks.filter((l) => l.id !== linkId);
	}

	$effect(() => {
		loadContextLinks();
	});

	// ── Searchable toggle ─────────────────────────────────────────────────────
	let isSearchable = $state(untrack(() => project.isSearchable ?? false));
	let togglingSearchable = $state(false);

	async function toggleSearchable() {
		togglingSearchable = true;
		try {
			const result = await trpc.projects.setSearchable.mutate({
				id: project.id,
				isSearchable: !isSearchable
			});
			isSearchable = result.isSearchable;
		} finally {
			togglingSearchable = false;
		}
	}

	// ── Interested users ──────────────────────────────────────────────────────
	let interestedUsers = $state<InterestedUser[]>([]);
	let loadedInterested = $state(false);
	let loadingInterested = $state(false);

	async function loadInterested() {
		if (loadedInterested) return;
		loadingInterested = true;
		try {
			interestedUsers = (await trpc.projects.listInterested.query(project.id)) as InterestedUser[];
			loadedInterested = true;
		} finally {
			loadingInterested = false;
		}
	}

	// ── Leave / remove collaborator ───────────────────────────────────────────
	let showLeaveProject = $state(false);
	let leavingProject = $state(false);
	let showRemoveCollaborator = $state(false);
	let removingCollaborator = $state(false);
	let collaboratorToRemove = $state<{ userId: string; name: string } | null>(null);

	async function handleLeaveProject() {
		leavingProject = true;
		try {
			await trpc.projects.leave.mutate(project.id);
			await goto('/projects', { invalidateAll: true });
		} catch (e: unknown) {
			leavingProject = false;
			showLeaveProject = false;
			alert(e instanceof Error ? e.message : 'Error leaving project');
		}
	}

	async function handleRemoveCollaborator() {
		if (!collaboratorToRemove) return;
		removingCollaborator = true;
		try {
			await trpc.projects.removeCollaborator.mutate({
				projectId: project.id,
				userId: collaboratorToRemove.userId
			});
			await invalidateAll();
			showRemoveCollaborator = false;
			collaboratorToRemove = null;
		} catch (e: unknown) {
			alert(e instanceof Error ? e.message : 'Error removing collaborator');
		} finally {
			removingCollaborator = false;
		}
	}
</script>

<div class="hidden flex-col gap-6 sm:flex">
	<!-- Project navigation -->
	<div
		class="rounded-xl border border-paper-border bg-paper p-4 dark:border-dark-paper-border dark:bg-dark-paper"
	>
		<div class="flex flex-col gap-1">
			<a
				href="/projects/{project.id}/ai"
				class="flex items-center gap-2.5 rounded-lg px-3 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui hover:text-ink dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui dark:hover:text-dark-ink"
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"
					><path
						d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					/></svg
				>
				Assistant
			</a>
			<a
				href="/projects/{project.id}/requirements"
				class="flex items-center gap-2.5 rounded-lg px-3 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui hover:text-ink dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui dark:hover:text-dark-ink"
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"
					><path
						d="M9 11l3 3L22 4"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					/><path
						d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					/></svg
				>
				Requirements
				<RequirementsProgress
					fulfilled={requirementCounts.fulfilled}
					total={requirementCounts.total}
					requiredFulfilled={requirementCounts.requiredFulfilled}
					requiredTotal={requirementCounts.requiredTotal}
				/>
			</a>
			<a
				href="/projects/{project.id}/issues"
				class="flex items-center gap-2.5 rounded-lg px-3 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui hover:text-ink dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui dark:hover:text-dark-ink"
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" />
					<circle cx="12" cy="12" r="3" fill="currentColor" />
				</svg>
				Issues
			</a>
			<a
				href="/projects/{project.id}/bib"
				class="flex items-center gap-2.5 rounded-lg px-3 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui hover:text-ink dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui dark:hover:text-dark-ink"
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"
					><path
						d="M4 19.5A2.5 2.5 0 016.5 17H20"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					/><path
						d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					/></svg
				>
				Bibliography
			</a>
			{#if canEdit && canUploadS3}
				<a
					href="/projects/{project.id}/photos"
					class="flex items-center gap-2.5 rounded-lg px-3 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui hover:text-ink dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui dark:hover:text-dark-ink"
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"
						><rect
							x="3"
							y="3"
							width="18"
							height="18"
							rx="2"
							stroke="currentColor"
							stroke-width="1.5"
						/><circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" stroke-width="1.5" /><path
							d="M21 15l-5-5L5 21"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						/></svg
					>
					Photos
				</a>
				<a
					href="/projects/{project.id}/notebooks"
					class="flex items-center gap-2.5 rounded-lg px-3 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui hover:text-ink dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui dark:hover:text-dark-ink"
				>
					<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
						<path
							fill-rule="evenodd"
							d="M13.887 3.182c.396.037.79.08 1.183.128C16.194 3.45 17 4.414 17 5.517V16.75A2.25 2.25 0 0 1 14.75 19h-9.5A2.25 2.25 0 0 1 3 16.75V5.517c0-1.103.806-2.068 1.93-2.207.393-.048.787-.09 1.183-.128A3.001 3.001 0 0 1 9 1h2c1.373 0 2.531.923 2.887 2.182ZM7.5 4A1.5 1.5 0 0 1 9 2.5h2A1.5 1.5 0 0 1 12.5 4v.5h-5V4Z"
							clip-rule="evenodd"
						/>
					</svg>
					Notebooks
				</a>
			{:else if canEdit && s3CtaType === 'personal'}
				<a
					href="/settings?tab=storage"
					class="flex items-center gap-2.5 rounded-lg border border-dashed border-paper-border px-3 py-2 font-sans text-sm text-ink-faint transition-colors hover:border-accent/40 hover:text-accent dark:border-dark-paper-border dark:text-dark-ink-faint"
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<rect
							x="3"
							y="3"
							width="18"
							height="18"
							rx="2"
							stroke="currentColor"
							stroke-width="1.5"
						/>
						<path
							d="M12 8v8M8 12h8"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
						/>
					</svg>
					Configure S3
				</a>
			{:else if canEdit && s3CtaType === 'org-owner'}
				<a
					href="/settings?tab=organizations"
					class="flex items-center gap-2.5 rounded-lg border border-dashed border-paper-border px-3 py-2 font-sans text-sm text-ink-faint transition-colors hover:border-accent/40 hover:text-accent dark:border-dark-paper-border dark:text-dark-ink-faint"
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<rect
							x="3"
							y="3"
							width="18"
							height="18"
							rx="2"
							stroke="currentColor"
							stroke-width="1.5"
						/>
						<path
							d="M12 8v8M8 12h8"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
						/>
					</svg>
					Configure org S3
				</a>
			{/if}
		</div>
	</div>

	{#if isOwner}
		<InviteCollaborator
			projectId={project.id}
			{invitations}
			{collaborators}
			oninvited={() => invalidateAll()}
			onremove={(c) => {
				collaboratorToRemove = c;
				showRemoveCollaborator = true;
			}}
		/>
	{:else}
		<div
			class="rounded-xl border border-paper-border bg-paper p-5 dark:border-dark-paper-border dark:bg-dark-paper"
		>
			<h3 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">Collaborators</h3>
			<p class="mt-2 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				{collaborators.length}
				{collaborators.length === 1 ? 'collaborator' : 'collaborators'}
			</p>
			<button
				onclick={() => (showLeaveProject = true)}
				class="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 font-sans text-xs text-red-500 transition-colors hover:border-red-300 hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-900/10"
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
					<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
					<polyline points="16 17 21 12 16 7" />
					<line x1="21" y1="12" x2="9" y2="12" />
				</svg>
				Leave project…
			</button>
		</div>
	{/if}

	<!-- Publication metadata -->
	{#if isOwner || project.doi || project.version || project.publishedAt}
		<div
			class="rounded-xl border border-paper-border bg-paper p-5 dark:border-dark-paper-border dark:bg-dark-paper"
		>
			<h3 class="mb-3 font-serif text-base font-semibold text-ink dark:text-dark-ink">
				Publication
			</h3>
			<div class="flex flex-col gap-2">
				<!-- DOI -->
				<div>
					<span
						class="font-sans text-[11px] font-semibold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint"
						>DOI</span
					>
					{#if editingField === 'doi'}
						<input
							{@attach focusEl}
							type="text"
							bind:value={editBuffer}
							onblur={() => saveField('doi')}
							onkeydown={(e) => {
								if (e.key === 'Enter') e.currentTarget.blur();
								if (e.key === 'Escape') cancelEdit();
							}}
							placeholder="10.1000/xyz123"
							class="mt-0.5 w-full rounded border border-accent/40 bg-transparent px-2 py-1 font-mono text-xs text-ink focus:outline-none dark:text-dark-ink"
						/>
					{:else}
						<button
							type="button"
							onclick={() => startEdit('doi')}
							disabled={!isOwner}
							class="mt-0.5 block w-full text-left font-mono text-xs {isOwner
								? 'cursor-text hover:opacity-70'
								: 'cursor-default'} {!project.doi
								? 'text-ink-faint italic dark:text-dark-ink-faint'
								: 'text-ink dark:text-dark-ink'}"
						>
							{project.doi || (isOwner ? 'Add DOI…' : '—')}
						</button>
					{/if}
				</div>
				<!-- Version -->
				<div>
					<span
						class="font-sans text-[11px] font-semibold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint"
						>Version</span
					>
					{#if editingField === 'version'}
						<input
							{@attach focusEl}
							type="text"
							bind:value={editBuffer}
							onblur={() => saveField('version')}
							onkeydown={(e) => {
								if (e.key === 'Enter') e.currentTarget.blur();
								if (e.key === 'Escape') cancelEdit();
							}}
							placeholder="1.0.0"
							class="mt-0.5 w-full rounded border border-accent/40 bg-transparent px-2 py-1 font-sans text-xs text-ink focus:outline-none dark:text-dark-ink"
						/>
					{:else}
						<button
							type="button"
							onclick={() => startEdit('version')}
							disabled={!isOwner}
							class="mt-0.5 block w-full text-left font-sans text-xs {isOwner
								? 'cursor-text hover:opacity-70'
								: 'cursor-default'} {!project.version
								? 'text-ink-faint italic dark:text-dark-ink-faint'
								: 'text-ink dark:text-dark-ink'}"
						>
							{project.version || (isOwner ? 'Add version…' : '—')}
						</button>
					{/if}
				</div>
				<!-- Published date -->
				<div>
					<span
						class="font-sans text-[11px] font-semibold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint"
						>Publication date</span
					>
					{#if editingField === 'publishedAt'}
						<input
							{@attach focusEl}
							type="date"
							bind:value={editBuffer}
							onblur={() => saveField('publishedAt')}
							onkeydown={(e) => {
								if (e.key === 'Enter') e.currentTarget.blur();
								if (e.key === 'Escape') cancelEdit();
							}}
							class="mt-0.5 w-full rounded border border-accent/40 bg-transparent px-2 py-1 font-sans text-xs text-ink focus:outline-none dark:text-dark-ink"
						/>
					{:else}
						<button
							type="button"
							onclick={() => startEdit('publishedAt')}
							disabled={!isOwner}
							class="mt-0.5 block w-full text-left font-sans text-xs {isOwner
								? 'cursor-text hover:opacity-70'
								: 'cursor-default'} {!project.publishedAt
								? 'text-ink-faint italic dark:text-dark-ink-faint'
								: 'text-ink dark:text-dark-ink'}"
						>
							{project.publishedAt
								? project.publishedAt.toLocaleDateString('en', {
										year: 'numeric',
										month: 'long',
										day: 'numeric'
									})
								: isOwner
									? 'Add date…'
									: '—'}
						</button>
					{/if}
				</div>
				<!-- Citation style -->
				{#if isOwner}
					<div>
						<span
							class="font-sans text-[11px] font-semibold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint"
							>Citation style</span
						>
						<div class="mt-1 flex flex-wrap gap-1.5">
							{#each Object.entries(CITATION_STYLE_LABELS) as [s, label] (s)}
								<button
									type="button"
									onclick={() =>
										setProjectCitationStyle(
											project.citationStyle === s ? null : (s as CitationStyle)
										)}
									class="rounded px-2 py-0.5 font-sans text-xs transition-colors {project.citationStyle ===
									s
										? 'bg-accent text-white'
										: 'border border-paper-border text-ink-muted hover:border-accent/50 dark:border-dark-paper-border dark:text-dark-ink-muted'}"
									>{label}</button
								>
							{/each}
						</div>
						{#if project.citationStyle}
							<p class="mt-1 font-sans text-[10px] text-ink-faint dark:text-dark-ink-faint">
								Documents inherit this style unless overridden.
							</p>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Context links for AI -->
	<div
		class="rounded-xl border border-paper-border bg-paper p-5 dark:border-dark-paper-border dark:bg-dark-paper"
	>
		<div class="mb-3 flex items-center justify-between gap-2">
			<div>
				<h3 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">
					External context
				</h3>
				<p class="mt-0.5 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
					Documents from other projects visible to the AI
				</p>
			</div>
			<button
				onclick={() => (showContextPicker = true)}
				class="flex shrink-0 items-center gap-1 rounded-md border border-paper-border px-2.5 py-1 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
			>
				<svg
					width="11"
					height="11"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.5"
					stroke-linecap="round"
					aria-hidden="true"
				>
					<line x1="12" y1="5" x2="12" y2="19" />
					<line x1="5" y1="12" x2="19" y2="12" />
				</svg>
				Add
			</button>
		</div>

		{#if contextLinks.length === 0}
			<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
				No external documents. Add notes from other projects for the AI to use as context.
			</p>
		{:else}
			<div class="flex flex-col gap-1">
				{#each contextLinks as link (link.id)}
					<div
						class="group flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-paper-ui dark:hover:bg-dark-paper-ui"
					>
						<div class="min-w-0 flex-1">
							<p class="truncate font-sans text-xs font-medium text-ink dark:text-dark-ink">
								{link.docTitle}
							</p>
							<p class="truncate font-sans text-[11px] text-ink-faint dark:text-dark-ink-faint">
								{link.sourceProjectTitle}
							</p>
						</div>
						<button
							onclick={() => removeContextLink(link.id)}
							class="mt-0.5 shrink-0 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500 dark:text-dark-ink-faint dark:hover:text-red-400"
							title="Remove"
							aria-label="Remove context link"
						>
							<svg
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								aria-hidden="true"
							>
								<path d="M18 6L6 18M6 6l12 12" />
							</svg>
						</button>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Public search visibility — owner only -->
	{#if isOwner}
		<div
			class="rounded-xl border border-paper-border bg-paper p-5 dark:border-dark-paper-border dark:bg-dark-paper"
		>
			<div class="flex items-center justify-between gap-3">
				<div>
					<h3 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">
						Public search
					</h3>
					<p class="mt-0.5 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
						{isSearchable
							? 'Visible in Explore. Shows title, description and Abstract.'
							: 'Visible to collaborators only.'}
					</p>
				</div>
				<button
					onclick={toggleSearchable}
					disabled={togglingSearchable}
					aria-pressed={isSearchable}
					aria-label="Toggle public search visibility"
					class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50
						{isSearchable ? 'bg-accent' : 'bg-paper-border dark:bg-dark-paper-border'}"
				>
					<span
						class="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform
						{isSearchable ? 'translate-x-6' : 'translate-x-1'}"
					></span>
				</button>
			</div>

			{#if isSearchable}
				<!-- Interested users -->
				<div class="mt-4 border-t border-paper-border pt-4 dark:border-dark-paper-border">
					<div class="mb-2 flex items-center justify-between">
						<h4
							class="font-sans text-xs font-semibold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint"
						>
							Interested
						</h4>
						{#if !loadedInterested}
							<button
								onclick={loadInterested}
								disabled={loadingInterested}
								class="font-sans text-xs text-accent hover:underline disabled:opacity-50"
							>
								{loadingInterested ? 'Loading…' : 'Load'}
							</button>
						{/if}
					</div>
					{#if loadedInterested}
						{#if interestedUsers.length === 0}
							<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
								No one has expressed interest yet.
							</p>
						{:else}
							<ul class="flex flex-col gap-2">
								{#each interestedUsers as u (u.id)}
									<li>
										<a
											href="/u/{u.userId}"
											class="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-paper-ui dark:hover:bg-dark-paper-ui"
										>
											<span
												class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/20 font-sans text-xs font-semibold text-accent"
											>
												{(u.displayName ?? u.name).charAt(0).toUpperCase()}
											</span>
											<div class="min-w-0">
												<p
													translate="no"
													class="truncate font-sans text-xs font-medium text-ink dark:text-dark-ink"
												>
													{u.displayName ?? u.name}
												</p>
												{#if u.institution}
													<p
														translate="no"
														class="truncate font-sans text-[11px] text-ink-faint dark:text-dark-ink-faint"
													>
														{u.institution}
													</p>
												{/if}
											</div>
										</a>
									</li>
								{/each}
							</ul>
						{/if}
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>

<SafeDeleteDialog
	open={showLeaveProject}
	label="this project"
	title="Leave this project"
	confirmLabel="Leave"
	warning="You will lose access to the project and its documents. The owner can invite you back."
	deleting={leavingProject}
	onconfirm={handleLeaveProject}
	oncancel={() => (showLeaveProject = false)}
/>

<SafeDeleteDialog
	open={showRemoveCollaborator}
	label={collaboratorToRemove?.name ?? 'this collaborator'}
	title="Remove {collaboratorToRemove?.name ?? 'this collaborator'}"
	confirmLabel="Remove"
	warning="They will immediately lose access to the project. You can invite them again."
	deleting={removingCollaborator}
	onconfirm={handleRemoveCollaborator}
	oncancel={() => {
		showRemoveCollaborator = false;
		collaboratorToRemove = null;
	}}
/>

{#if showContextPicker}
	<ContextPickerModal
		projectId={project.id}
		{contextLinks}
		onclose={() => (showContextPicker = false)}
		onadd={addContextLink}
	/>
{/if}
