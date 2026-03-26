<script lang="ts">
	import { trpc } from '$lib/utils/trpc';
	import { untrack } from 'svelte';
	import type { PageData } from './$types';

	const roleValues = ['author', 'coauthor', 'reviewer', 'commenter'] as const;
	type Role = (typeof roleValues)[number];
	const roleLabel: Record<Role, string> = {
		author: 'Author',
		coauthor: 'Co-author',
		reviewer: 'Reviewer',
		commenter: 'Commenter'
	};
	const roleColor: Record<Role, string> = {
		author: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
		coauthor: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
		reviewer: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
		commenter: 'bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300'
	};

	let { data }: { data: PageData } = $props();

	let pinnedSet = $state(new Set<string>(untrack(() => data.pinnedProjectIds)));

	// Invitar desde perfil
	let inviting = $state(false);
	let myProjects = $state<{ id: string; title: string }[]>([]);
	let loadingProjects = $state(false);
	let inviteProjectId = $state('');
	let inviteRole = $state<Role>('coauthor');
	let inviteError = $state('');
	let inviteSuccess = $state('');
	let sendingInvite = $state(false);

	async function startInviting() {
		inviting = true;
		loadingProjects = true;
		try {
			myProjects = await trpc.projects.listForQuickNote.query();
			if (myProjects.length > 0) inviteProjectId = myProjects[0].id;
		} finally {
			loadingProjects = false;
		}
	}

	async function sendInvite() {
		if (!inviteProjectId) return;
		sendingInvite = true;
		inviteError = '';
		try {
			await trpc.invitations.createForUserId.mutate({
				projectId: inviteProjectId,
				userId: data.profile.userId,
				role: inviteRole
			});
			inviteSuccess = 'Invitation sent.';
			inviting = false;
		} catch (e) {
			inviteError = e instanceof Error ? e.message : 'Error sending invitation';
		} finally {
			sendingInvite = false;
		}
	}

	// Pin/unpin
	let pinning = $state<string | null>(null);
	let pinError = $state('');

	async function togglePin(projectId: string) {
		pinning = projectId;
		pinError = '';
		try {
			if (pinnedSet.has(projectId)) {
				await trpc.discover.unpin.mutate(projectId);
				pinnedSet = new Set([...pinnedSet].filter((id) => id !== projectId));
			} else {
				await trpc.discover.pin.mutate(projectId);
				pinnedSet = new Set([...pinnedSet, projectId]);
			}
		} catch (e) {
			pinError = e instanceof Error ? e.message : 'Error';
		} finally {
			pinning = null;
		}
	}

	const initials = $derived(
		(data.profile.displayName ?? data.profile.name)
			.split(' ')
			.slice(0, 2)
			.map((w: string) => w[0])
			.join('')
			.toUpperCase()
	);

	function formatLastActive(date: Date | string | null): string {
		if (!date) return 'No activity recorded';
		const d = new Date(date);
		const now = new Date();
		const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
		if (days === 0) return 'Today';
		if (days === 1) return 'Yesterday';
		if (days < 30) return `${days} days ago`;
		if (days < 365) return `${Math.floor(days / 30)} months ago`;
		return `${Math.floor(days / 365)} years ago`;
	}
</script>

<div class="mx-auto max-w-2xl px-6 py-10">
	<!-- Cabecera del perfil -->
	<div class="flex items-start gap-5">
		<div class="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-accent/20 font-serif text-2xl font-semibold text-accent">
			{initials}
		</div>
		<div class="min-w-0 flex-1">
			<h1 class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">
				{data.profile.displayName ?? data.profile.name}
			</h1>
			{#if data.profile.institution}
				<p class="mt-0.5 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
					{data.profile.institution}
				</p>
			{/if}
			{#if data.profile.orcid}
				<div class="mt-0.5 flex items-center gap-1.5">
					<a
						href="https://orcid.org/{data.profile.orcid}"
						target="_blank"
						rel="noopener noreferrer"
						class="flex items-center gap-1 font-sans text-xs text-ink-faint hover:text-accent dark:text-dark-ink-faint"
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="#A6CE39" class="shrink-0">
							<path d="M12 0C5.372 0 0 5.372 0 12s5.372 12 12 12 12-5.372 12-12S18.628 0 12 0zM7.369 4.378c.525 0 .947.431.947.947s-.422.947-.947.947a.95.95 0 0 1-.947-.947c0-.525.422-.947.947-.947zm-.722 3.038h1.444v10.041H6.647V7.416zm3.562 0h3.9c3.712 0 5.344 2.653 5.344 5.025 0 2.578-2.016 5.016-5.325 5.016h-3.919V7.416zm1.444 1.303v7.444h2.297c3.272 0 3.872-2.484 3.872-3.722 0-2.016-1.284-3.722-3.884-3.722h-2.285z"/>
						</svg>
						{data.profile.orcid}
					</a>
					{#if data.profile.orcidVerified}
						<span
							title="Identity verified with ORCID"
							class="inline-flex items-center gap-0.5 rounded-full bg-green-100 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400"
						>
							<svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
								<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd"/>
							</svg>
							Verificado
						</span>
					{/if}
				</div>
			{/if}
			{#if data.profile.bio}
				<p class="mt-3 font-sans text-sm text-ink dark:text-dark-ink">{data.profile.bio}</p>
			{/if}
		</div>
	</div>

	<!-- Reputación como colaborador -->
	{#if data.reputation.projectsTotal > 0 || data.reputation.totalCommits > 0}
		<section class="mt-8">
			<h2 class="mb-3 font-sans text-xs font-semibold uppercase tracking-wide text-ink-faint dark:text-dark-ink-faint">
				Collaboration history
			</h2>

			<!-- Stats row -->
			<div class="grid grid-cols-3 gap-3">
				<div class="rounded-xl border border-paper-border bg-paper px-4 py-3 text-center dark:border-dark-paper-border dark:bg-dark-paper">
					<p class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">
						{data.reputation.projectsTotal}
					</p>
					<p class="mt-0.5 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
						{data.reputation.projectsTotal === 1 ? 'project' : 'projects'}
					</p>
				</div>
				<div class="rounded-xl border border-paper-border bg-paper px-4 py-3 text-center dark:border-dark-paper-border dark:bg-dark-paper">
					<p class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">
						{data.reputation.projectsCompleted}
					</p>
					<p class="mt-0.5 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">completed</p>
				</div>
				<div class="rounded-xl border border-paper-border bg-paper px-4 py-3 text-center dark:border-dark-paper-border dark:bg-dark-paper">
					<p class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">
						{data.reputation.totalCommits}
					</p>
					<p class="mt-0.5 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">commits</p>
				</div>
			</div>

			<!-- Roles worked -->
			{#if data.reputation.rolesWorked.length > 0}
				<div class="mt-3 flex flex-wrap gap-2">
					{#each data.reputation.rolesWorked as role (role)}
						<span class="rounded-full px-2.5 py-1 font-sans text-xs font-medium {roleColor[role as Role] ?? 'bg-paper-border text-ink-muted'}">
							{roleLabel[role as Role] ?? role}
						</span>
					{/each}
				</div>
			{/if}

			<!-- Última actividad -->
			<p class="mt-2 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
				Last activity: {formatLastActive(data.reputation.lastActiveAt)}
			</p>
		</section>
	{:else if !data.isOwnProfile}
		<section class="mt-8">
			<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
				No collaboration history on the platform yet.
			</p>
		</section>
	{/if}

	<!-- Proyectos buscables que pertenecen a este usuario -->
	{#if data.ownedSearchableProjects.length > 0}
		<section class="mt-8">
			<h2 class="mb-3 font-sans text-xs font-semibold uppercase tracking-wide text-ink-faint dark:text-dark-ink-faint">
				Open projects
			</h2>
			<ul class="flex flex-col gap-3">
				{#each data.ownedSearchableProjects as proj (proj.id)}
					<li class="flex items-center justify-between gap-4 rounded-xl border border-paper-border bg-paper px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper">
						<div class="min-w-0">
							<p class="truncate font-sans text-sm font-medium text-ink dark:text-dark-ink">
								{proj.title}
							</p>
							{#if proj.description}
								<p class="mt-0.5 truncate font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
									{proj.description}
								</p>
							{/if}
						</div>
						{#if !data.isOwnProfile}
							<button
								onclick={() => togglePin(proj.id)}
								disabled={pinning === proj.id}
								class="shrink-0 rounded-lg border px-3 py-1.5 font-sans text-xs font-medium transition-colors disabled:opacity-50
									{pinnedSet.has(proj.id)
									? 'border-accent bg-accent/10 text-accent'
									: 'border-paper-border text-ink-muted hover:border-accent hover:text-accent dark:border-dark-paper-border dark:text-dark-ink-muted'}"
							>
								{pinning === proj.id ? '…' : pinnedSet.has(proj.id) ? '★ Saved' : '☆ Save'}
							</button>
						{/if}
					</li>
				{/each}
			</ul>
			{#if pinError}
				<p class="mt-2 font-sans text-xs text-red-600">{pinError}</p>
			{/if}
		</section>
	{/if}

	<!-- Invite to collaborate (solo si no es el propio perfil) -->
	{#if !data.isOwnProfile}
		<section class="mt-8">
			<h2 class="mb-3 font-sans text-xs font-semibold uppercase tracking-wide text-ink-faint dark:text-dark-ink-faint">
				Invite to collaborate
			</h2>

			{#if inviteSuccess}
				<p class="font-sans text-sm text-green-600">{inviteSuccess}</p>
			{:else if !inviting}
				<button
					onclick={startInviting}
					class="rounded-lg border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted transition-colors hover:border-accent hover:text-accent dark:border-dark-paper-border dark:text-dark-ink-muted"
				>
					Invite to one of my projects
				</button>
			{:else if loadingProjects}
				<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">Cargando proyectos…</p>
			{:else if myProjects.length === 0}
				<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
					No tienes proyectos donde puedas invitar.
				</p>
			{:else}
				<div class="flex flex-col gap-3 rounded-xl border border-paper-border bg-paper p-4 dark:border-dark-paper-border dark:bg-dark-paper">
					<div class="flex flex-col gap-1">
						<label for="inv-project" class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
							Proyecto
						</label>
						<select
							id="inv-project"
							bind:value={inviteProjectId}
							class="rounded-lg border border-paper-border bg-surface px-3 py-2 font-sans text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent dark:border-dark-paper-border dark:bg-dark-surface dark:text-dark-ink"
						>
							{#each myProjects as p (p.id)}
								<option value={p.id}>{p.title}</option>
							{/each}
						</select>
					</div>

					<div class="flex flex-col gap-1">
						<label for="inv-role" class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
							Rol
						</label>
						<select
							id="inv-role"
							bind:value={inviteRole}
							class="rounded-lg border border-paper-border bg-surface px-3 py-2 font-sans text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent dark:border-dark-paper-border dark:bg-dark-surface dark:text-dark-ink"
						>
							{#each roleValues as role (role)}
								<option value={role}>{roleLabel[role]}</option>
							{/each}
						</select>
					</div>

					{#if inviteError}
						<p class="font-sans text-xs text-red-600">{inviteError}</p>
					{/if}

					<div class="flex gap-2">
						<button
							onclick={sendInvite}
							disabled={sendingInvite}
							class="rounded-lg bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
						>
							{sendingInvite ? 'Sending…' : 'Send invitation'}
						</button>
						<button
							onclick={() => { inviting = false; inviteError = ''; }}
							class="rounded-lg border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted dark:border-dark-paper-border dark:text-dark-ink-muted"
						>
							Cancelar
						</button>
					</div>
				</div>
			{/if}
		</section>
	{/if}
</div>
