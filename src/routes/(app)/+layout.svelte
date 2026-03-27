<script lang="ts">
	import { onMount } from 'svelte';
	import Navbar from '$lib/components/layout/Navbar.svelte';
	import MobileHeader from '$lib/components/layout/MobileHeader.svelte';
	import MobileNav from '$lib/components/layout/MobileNav.svelte';
	import FeedbackButton from '$lib/components/layout/FeedbackButton.svelte';
	import { themeStore, type ThemeId } from '$lib/stores/theme.svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	onMount(() => {
		// localStorage is the source of truth for instant no-flash rendering.
		// The server value (data.theme) is used as fallback for cross-device sync.
		const storedTheme = localStorage.getItem('scholio-theme') as ThemeId | null;
		const storedDark = localStorage.getItem('scholio-dark') === '1';
		const id = storedTheme ?? (data.theme as ThemeId) ?? 'warm';
		themeStore.init(id, storedDark);
	});
</script>

<div class="flex h-screen flex-col overflow-hidden bg-paper-ui dark:bg-dark-paper-ui">
	<!-- Desktop nav -->
	<div class="hidden sm:block">
		<Navbar user={data.user} pendingInvitationCount={data.pendingInvitationCount} />
	</div>
	<!-- Mobile header -->
	<MobileHeader user={data.user} />

	<main class="flex-1 overflow-y-auto pb-16 sm:pb-0">
		{@render children()}
	</main>
	<FeedbackButton />
	<footer class="hidden border-t border-paper-border px-6 py-3 sm:block dark:border-dark-paper-border">
		<p class="text-center font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
			Scholio Beta · Desarrollado con
			<a
				href="https://claude.ai/code"
				target="_blank"
				rel="noopener noreferrer"
				class="underline decoration-dotted hover:text-ink-muted dark:hover:text-dark-ink-muted"
			>Claude Code</a
			>
			· Asistente IA impulsado por
			<span class="font-medium">Claude Haiku 4.5</span> (Anthropic)
		</p>
	</footer>
	<!-- Mobile bottom nav -->
	<MobileNav />
</div>
