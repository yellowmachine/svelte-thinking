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
	import { connectivity } from '$lib/stores/connectivity.svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	onMount(() => {
		// localStorage is the source of truth for instant no-flash rendering.
		// The server value (data.theme) is used as fallback for cross-device sync.
		const storedTheme = localStorage.getItem('scholio-theme') as ThemeId | null;
		const storedDark = localStorage.getItem('scholio-dark') === '1';
		const id = storedTheme ?? (data.theme as ThemeId) ?? 'warm';
		themeStore.init(id, storedDark);
		workspaceStore.init(data.orgs);
		onlineStore.init();
	});

	// Trigger global sync whenever connection is restored
	$effect(() => {
		if (onlineStore.online) {
			connectivity.syncAll();
		}
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
			· AI asistent powered by
			<span class="font-medium">Claude Haiku 4.5</span> (Anthropic)
		</p>
	</footer>
	<!-- Mobile bottom nav -->
	<MobileNav />
</div>
