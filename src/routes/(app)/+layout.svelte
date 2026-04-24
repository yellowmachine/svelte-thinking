<script lang="ts">
	import { onMount } from 'svelte';
	import Navbar from '$lib/components/layout/Navbar.svelte';
	import MobileHeader from '$lib/components/layout/MobileHeader.svelte';
	import MobileNav from '$lib/components/layout/MobileNav.svelte';
	import FeedbackButton from '$lib/components/layout/FeedbackButton.svelte';
	import ConnectivityBanner from '$lib/components/ui/ConnectivityBanner.svelte';
	import { themeStore, type ThemeId } from '$lib/stores/theme.svelte';
	import { workspaceStore } from '$lib/stores/workspace.svelte';
	import { onlineStore } from '$lib/stores/online.svelte';
	import { pendingCreates } from '$lib/offline/pending-creates.svelte';
	import { trpc } from '$lib/utils/trpc';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	// Dismissed IDs managed client-side; initial list comes from server (already filtered).
	let dismissed = $state<Set<string>>(new Set());
	let visibleNotifications = $derived(
		data.activeNotifications.filter((n) => !dismissed.has(n.id))
	);

	async function dismiss(id: string) {
		dismissed = new Set([...dismissed, id]);
		await trpc.notifications.dismiss.mutate({ notificationId: id });
	}

	onMount(() => {
		// localStorage is the source of truth for instant no-flash rendering.
		// The server value (data.theme) is used as fallback for cross-device sync.
		const storedTheme = localStorage.getItem('scholio-theme') as ThemeId | null;
		const storedDark = localStorage.getItem('scholio-dark') === '1';
		const id = storedTheme ?? (data.theme as ThemeId) ?? 'warm';
		themeStore.init(id, storedDark);
		workspaceStore.init(data.orgs);
		onlineStore.init();
		pendingCreates.init();
	});

</script>

<div class="flex h-screen flex-col overflow-hidden bg-paper-ui dark:bg-dark-paper-ui">
	<!-- Desktop nav -->
	<div class="hidden sm:block">
		<Navbar
			user={data.user}
			pendingInvitationCount={data.pendingInvitationCount}
			orgs={data.orgs}
		/>
	</div>
	<!-- Mobile header -->
	<MobileHeader user={data.user} />

	<!-- Notification banners -->
	{#each visibleNotifications as n (n.id)}
		<div class="flex shrink-0 items-start gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-700/50 dark:bg-amber-900/20">
			<svg class="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<circle cx="12" cy="12" r="10" />
				<line x1="12" y1="8" x2="12" y2="12" />
				<line x1="12" y1="16" x2="12.01" y2="16" />
			</svg>
			<p class="flex-1 font-sans text-sm text-amber-900 dark:text-amber-200">{n.message}</p>
			<button
				onclick={() => dismiss(n.id)}
				aria-label="Dismiss notification"
				class="shrink-0 rounded p-0.5 text-amber-600 transition-colors hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-800/30"
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<line x1="18" y1="6" x2="6" y2="18" />
					<line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>
		</div>
	{/each}

	<main id="main-content" class="flex-1 overflow-y-auto pb-16 sm:pb-0">
		{@render children()}
	</main>
	<ConnectivityBanner />
	<FeedbackButton />
	<footer
		class="hidden border-t border-paper-border px-6 py-3 sm:block dark:border-dark-paper-border"
	>
		<p class="text-center font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
			Scholio Beta · Developed with
			<a
				href="https://claude.ai/code"
				target="_blank"
				rel="noopener noreferrer"
				class="underline decoration-dotted hover:text-ink-muted dark:hover:text-dark-ink-muted"
				>Claude Code</a
			>
			· AI assistant powered by
			<span class="font-medium">Claude Haiku 4.5</span> (Anthropic)
		</p>
	</footer>
	<!-- Mobile bottom nav -->
	<MobileNav />
</div>
