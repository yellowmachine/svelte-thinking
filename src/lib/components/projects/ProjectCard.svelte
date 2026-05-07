<script lang="ts">
	import { type ProjectStatus, PROJECT_STATUS_LABELS } from '$lib/domain/project';
	let {
		title,
		description,
		status = 'draft',
		collaboratorCount = 1,
		openComments = 0,
		openIssues = 0,
		updatedAt,
		reviewHref,
		scheduledDeleteAt,
		hasActiveShares = false,
		onclick,
		ondelete
	}: {
		title: string;
		description?: string;
		status?: ProjectStatus;
		collaboratorCount?: number;
		openComments?: number;
		openIssues?: number;
		updatedAt?: Date;
		reviewHref?: string;
		scheduledDeleteAt?: Date | null;
		hasActiveShares?: boolean;
		onclick?: () => void;
		ondelete?: () => void;
	} = $props();

	const daysLeft = $derived(
		scheduledDeleteAt
			? Math.max(
					0,
					Math.ceil((new Date(scheduledDeleteAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
				)
			: null
	);

	const statusStyle: Record<ProjectStatus, string> = {
		draft: 'bg-paper-border text-ink-muted dark:bg-dark-paper-border dark:text-dark-ink-muted',
		active: 'bg-green-100 text-green-700',
		review: 'bg-amber-100 text-amber-700',
		published: 'bg-blue-100 text-blue-700',
		archived: 'bg-paper-border text-ink-faint dark:bg-dark-paper-border dark:text-dark-ink-faint'
	};

	let formattedDate = $derived(
		updatedAt
			? new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' }).format(
					updatedAt
				)
			: null
	);

	let menuOpen = $state(false);

	function toggleMenu(e: MouseEvent) {
		e.stopPropagation();
		menuOpen = !menuOpen;
	}

	function closeMenu() {
		menuOpen = false;
	}
</script>

<svelte:window onclick={closeMenu} />

<div class="group relative">
	<!-- Card body -->
	<div
		role="button"
		tabindex="0"
		{onclick}
		onkeydown={(e) => e.key === 'Enter' && onclick?.()}
		class="w-full cursor-pointer rounded-xl border border-paper-border bg-paper p-5 text-left transition-all hover:border-accent/30 hover:shadow-sm dark:border-dark-paper-border dark:bg-dark-paper dark:hover:border-accent/30"
	>
		<div class="flex items-start justify-between gap-3">
			<div class="flex min-w-0 items-center gap-2">
				<h3
					translate="no"
					class="font-serif text-lg font-semibold text-ink group-hover:text-accent dark:text-dark-ink dark:group-hover:text-accent"
				>
					{title}
				</h3>
				{#if hasActiveShares}
					<span
						class="mt-0.5 shrink-0 text-accent"
						title="Has active public links"
						aria-label="Has active public links"
					>
						<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
							<circle cx="2" cy="10" r="1.5" fill="currentColor" />
							<path
								d="M2 7a3 3 0 0 1 3 3"
								stroke="currentColor"
								stroke-width="1.2"
								stroke-linecap="round"
							/>
							<path
								d="M2 3.5A6.5 6.5 0 0 1 8.5 10"
								stroke="currentColor"
								stroke-width="1.2"
								stroke-linecap="round"
							/>
						</svg>
					</span>
				{/if}
			</div>
			<div class="flex shrink-0 items-center gap-1.5">
				{#if daysLeft !== null}
					<span
						class="rounded-full bg-red-100 px-2.5 py-0.5 font-sans text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400"
					>
						Deleting in {daysLeft}d
					</span>
				{:else}
					<span
						class="rounded-full px-2.5 py-0.5 font-sans text-xs font-medium {statusStyle[status]}"
					>
						{PROJECT_STATUS_LABELS[status]}
					</span>
				{/if}
				<!-- Spacer for ⋮ button so status badge doesn't overlap it -->
				{#if ondelete}
					<span class="w-6"></span>
				{/if}
			</div>
		</div>

		{#if description}
			<p
				translate="no"
				class="mt-2 line-clamp-2 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted"
			>
				{description}
			</p>
		{/if}

		<div class="mt-4 flex items-center gap-4">
			<span
				class="flex items-center gap-1.5 font-sans text-xs text-ink-faint dark:text-dark-ink-faint"
			>
				<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
					<circle cx="6" cy="4" r="2" stroke="currentColor" stroke-width="1.2" />
					<path
						d="M2 10c0-2.21 1.79-4 4-4s4 1.79 4 4"
						stroke="currentColor"
						stroke-width="1.2"
						stroke-linecap="round"
					/>
				</svg>
				{collaboratorCount}
				{collaboratorCount === 1 ? 'collaborator' : 'collaborators'}
			</span>

			{#if formattedDate}
				<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
					Updated {formattedDate}
				</span>
			{/if}

			{#if openComments > 0 || openIssues > 0}
				<div class="ml-auto flex items-center gap-1.5">
					{#if openComments > 0}
						{#if reviewHref}
							<a
								href={reviewHref}
								onclick={(e) => e.stopPropagation()}
								class="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-sans text-xs font-medium text-amber-700 transition-colors hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50"
								title="View open comments"
							>
								<svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
									<path
										d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
								{openComments}
							</a>
						{:else}
							<span
								class="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-sans text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
							>
								<svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
									<path
										d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
								{openComments}
							</span>
						{/if}
					{/if}
					{#if openIssues > 0}
						<span
							class="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 font-sans text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
							title="Open issues"
						>
							<svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
								<line
									x1="12"
									y1="8"
									x2="12"
									y2="12"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
								/>
								<circle
									cx="12"
									cy="16"
									r="0.5"
									fill="currentColor"
									stroke="currentColor"
									stroke-width="1"
								/>
							</svg>
							{openIssues}
						</span>
					{/if}
				</div>
			{/if}
		</div>
	</div>

	<!-- ⋮ menu (owner only) -->
	{#if ondelete}
		<div class="absolute top-2 right-2">
			<button
				type="button"
				onclick={toggleMenu}
				class="flex h-7 w-7 items-center justify-center rounded-md text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 hover:bg-paper-ui hover:text-ink dark:text-dark-ink-faint dark:hover:bg-dark-paper-ui dark:hover:text-dark-ink"
				aria-label="Project options"
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
					<circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle
						cx="12"
						cy="19"
						r="2"
					/>
				</svg>
			</button>

			{#if menuOpen}
				<div
					class="absolute top-full right-0 z-20 mt-1 w-44 rounded-lg border border-paper-border bg-paper shadow-lg dark:border-dark-paper-border dark:bg-dark-paper"
					role="menu"
				>
					<button
						type="button"
						role="menuitem"
						onclick={(e) => {
							e.stopPropagation();
							menuOpen = false;
							ondelete?.();
						}}
						class="flex w-full items-center gap-2 px-3 py-2 font-sans text-xs text-red-500 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/10"
					>
						<svg
							width="12"
							height="12"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							aria-hidden="true"
						>
							<polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path
								d="M10 11v6M14 11v6"
							/><path d="M9 6V4h6v2" />
						</svg>
						Delete project…
					</button>
				</div>
			{/if}
		</div>
	{/if}
</div>
