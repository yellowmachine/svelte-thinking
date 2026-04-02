<script lang="ts">
	import QuickNoteButton from './QuickNoteButton.svelte';
	import ThemePicker from './ThemePicker.svelte';
	import { workspaceStore } from '$lib/stores/workspace.svelte';
	import { offlineDb } from '$lib/offline.db';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	async function handleLogout(e: SubmitEvent) {
		e.preventDefault();
		try { await offlineDb.delete(); } catch {}
		(e.target as HTMLFormElement).submit();
	}

	let themeOpen = $state(false);
	let workspaceOpen = $state(false);

	let {
		user,
		pendingInvitationCount = 0,
		orgs = []
	}: {
		user: { name: string; email: string };
		pendingInvitationCount?: number;
		orgs?: { id: string; name: string; role: string }[];
	} = $props();

	const initials = $derived(
		user.name
			.split(' ')
			.map((w) => w[0])
			.slice(0, 2)
			.join('')
			.toUpperCase()
	);
</script>

<nav
	class="sticky top-0 z-30 border-b border-paper-border bg-paper/95 backdrop-blur-sm dark:border-dark-paper-border dark:bg-dark-paper/95"
>
	<div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
		<div class="flex items-center gap-2">
			<a
				href="/projects"
				class="flex items-center gap-2 font-serif text-xl font-semibold text-ink dark:text-dark-ink"
			>
				Scholio
				<span class="rounded-full border border-accent/40 px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wide text-accent">
					beta
				</span>
			</a>

			<!-- Workspace indicator (only when in an org workspace) -->
			{#if orgs.length > 0}
				<div class="relative">
					<button
						type="button"
						onclick={() => (workspaceOpen = !workspaceOpen)}
						class="flex items-center gap-1 font-sans text-sm text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
					>
						{#if workspaceStore.current.id !== null}
							<span>({workspaceStore.current.name})</span>
						{/if}
						<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
							<path d="m6 9 6 6 6-6"/>
						</svg>
					</button>

					{#if workspaceOpen}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="fixed inset-0 z-40"
							onclick={() => (workspaceOpen = false)}
							onkeydown={(e) => e.key === 'Escape' && (workspaceOpen = false)}
						></div>
						<div class="absolute left-0 top-8 z-50 min-w-44 rounded-xl border border-paper-border bg-paper py-1 shadow-lg dark:border-dark-paper-border dark:bg-dark-paper">
							<p class="px-3 py-1.5 font-sans text-[10px] font-semibold uppercase tracking-wide text-ink-faint dark:text-dark-ink-faint">Workspace</p>
							<button
								type="button"
								onclick={() => { workspaceStore.set({ id: null, name: 'Personal' }); workspaceOpen = false; }}
								class="flex w-full items-center gap-2 px-3 py-2 text-left font-sans text-sm transition-colors hover:bg-paper-ui dark:hover:bg-dark-paper-ui {workspaceStore.current.id === null ? 'text-accent' : 'text-ink dark:text-dark-ink'}"
							>
								<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
								</svg>
								Personal
							</button>
							<div class="my-1 border-t border-paper-border dark:border-dark-paper-border"></div>
							{#each orgs as org (org.id)}
								<button
									type="button"
									onclick={() => {
									workspaceStore.set({ id: org.id, name: org.name });
									workspaceOpen = false;
									if (page.url.pathname.startsWith('/projects/')) goto('/projects');
								}}
									class="flex w-full items-center gap-2 px-3 py-2 text-left font-sans text-sm transition-colors hover:bg-paper-ui dark:hover:bg-dark-paper-ui {workspaceStore.current.id === org.id ? 'text-accent' : 'text-ink dark:text-dark-ink'}"
								>
									<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
									</svg>
									<span class="truncate">{org.name}</span>
									{#if org.role === 'owner'}
										<span class="ml-auto font-sans text-[10px] text-ink-faint dark:text-dark-ink-faint">owner</span>
									{/if}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<div class="flex items-center gap-4">
			<nav class="hidden items-center gap-4 sm:flex">
				<a href="/projects" class="font-sans text-sm text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink">
					Projects
				</a>
				<a href="/bib" class="font-sans text-sm text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink">
					Bibliography
				</a>
				<a href="/explore" class="font-sans text-sm text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink">
					Explore
				</a>
				<a href="/network" class="relative font-sans text-sm text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink">
					Network
					{#if pendingInvitationCount > 0}
						<span class="absolute -top-1.5 -right-3 flex h-4 w-4 items-center justify-center rounded-full bg-accent font-sans text-[10px] font-semibold text-white">
							{pendingInvitationCount > 9 ? '9+' : pendingInvitationCount}
						</span>
					{/if}
				</a>
				<a href="/help" class="font-sans text-sm text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink">
					Help
				</a>
				<a href="/blog" class="font-sans text-sm text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink">
					Blog
				</a>

			</nav>
			<QuickNoteButton />

			<!-- Theme picker -->
			<div class="relative">
				<button
					type="button"
					title="Appearance"
					aria-label="Appearance"
					onclick={() => (themeOpen = !themeOpen)}
					class="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-paper-ui hover:text-ink dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui dark:hover:text-dark-ink"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="13.5" cy="6.5" r="2.5"/><circle cx="19" cy="13" r="2.5"/><circle cx="6" cy="14" r="2.5"/><circle cx="10.5" cy="19.5" r="2.5"/>
						<path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
					</svg>
				</button>

				{#if themeOpen}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="fixed inset-0 z-40"
						onclick={() => (themeOpen = false)}
						onkeydown={(e) => e.key === 'Escape' && (themeOpen = false)}
					></div>
					<div class="absolute right-0 top-10 z-50 w-80 rounded-xl border border-paper-border bg-paper p-4 shadow-lg dark:border-dark-paper-border dark:bg-dark-paper">
						<p class="mb-3 font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted">Appearance</p>
						<ThemePicker />
					</div>
				{/if}
			</div>

			<div class="flex items-center gap-2.5">
				<a
					href="/settings"
					title="Settings"
					class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent font-sans text-xs font-semibold text-white transition-opacity hover:opacity-80"
				>
					{initials}
				</a>
				<div class="hidden sm:block">
					<p class="font-sans text-sm font-medium text-ink dark:text-dark-ink">{user.name}</p>
					<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">{user.email}</p>
				</div>
			</div>

			<form method="post" action="/logout" onsubmit={handleLogout}>
				<button
					type="submit"
					class="rounded-md px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui hover:text-ink dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui dark:hover:text-dark-ink"
				>
					Sign out
				</button>
			</form>
		</div>
	</div>
</nav>
