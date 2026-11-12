<script lang="ts">
	import { onMount } from 'svelte';
	import Navbar from '$lib/components/layout/Navbar.svelte';
	import MobileHeader from '$lib/components/layout/MobileHeader.svelte';
	import MobileNav from '$lib/components/layout/MobileNav.svelte';
	import FeedbackButton from '$lib/components/layout/FeedbackButton.svelte';
	import AiSpendBanner from '$lib/components/layout/AiSpendBanner.svelte';
	import Banner from '$lib/components/ui/Banner.svelte';
	import { themeStore, type ThemeId } from '$lib/stores/theme.svelte';
	import { workspaceStore } from '$lib/stores/workspace.svelte';
	import { onlineStore } from '$lib/stores/online.svelte';
	import { focusMode } from '$lib/stores/focusMode.svelte';
	import { page } from '$app/state';
	import { trpc } from '$lib/utils/trpc';
	import { resolve } from '$app/paths';
	import { AI_TASKS } from '$lib/ai-config';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	// Dismissed IDs managed client-side; initial list comes from server (already filtered).
	let dismissed = $state<Set<string>>(new Set());
	let visibleNotifications = $derived(data.activeNotifications.filter((n) => !dismissed.has(n.id)));

	const OBSOLETE_AI_NOTICE = 'obsolete-ai-models';
	type Notice = {
		id: string;
		variant: 'danger' | 'warning';
		message: string;
		dismissible: boolean;
	};
	const notices = $derived<Notice[]>([
		...(data.obsoleteAiTasks.length > 0
			? [{ id: OBSOLETE_AI_NOTICE, variant: 'danger' as const, message: '', dismissible: false }]
			: []),
		...visibleNotifications.map((n) => ({
			id: n.id,
			variant: 'warning' as const,
			message: n.message,
			dismissible: true
		}))
	]);
	let showAllNotices = $state(false);

	function taskLabel(taskId: string): string {
		return AI_TASKS.find((t) => t.id === taskId)?.label ?? taskId;
	}

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
	});
</script>

<div class="flex h-screen flex-col overflow-hidden bg-paper-ui">
	<!-- Focus mode (editor) hides all the chrome above the content -->
	{#if !focusMode.on}
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

		<!-- AI spending line, if the user turned it on in Settings → AI -->
		{#if data.showAiSpendBanner}
			<AiSpendBanner />
		{/if}

		<!-- One notice slot: the most important one shows, the rest behind "+N more".
		     Order: broken AI configuration (danger) first, then admin notices. -->
		{#if notices.length > 0}
			<div class="shrink-0">
				{#each showAllNotices ? notices : notices.slice(0, 1) as notice (notice.id)}
					<Banner
						variant={notice.variant}
						ondismiss={notice.dismissible ? () => dismiss(notice.id) : undefined}
					>
						{#if notice.id === OBSOLETE_AI_NOTICE}
							{#if data.obsoleteAiTasks.length === 1}
								The AI model chosen for "{taskLabel(data.obsoleteAiTasks[0].task)}" is no longer
								available.
							{:else}
								{data.obsoleteAiTasks.length} of the AI models you chose are no longer available.
							{/if}
							<a href="{resolve('/settings')}?tab=ai" class="font-medium underline">
								Choose another in Settings →
							</a>
						{:else}
							{notice.message}
						{/if}
						{#snippet action()}
							{#if notices.length > 1 && notice === notices[0]}
								<button
									type="button"
									onclick={() => (showAllNotices = !showAllNotices)}
									aria-expanded={showAllNotices}
									class="font-medium whitespace-nowrap underline underline-offset-2"
								>
									{showAllNotices ? 'Show less' : `+${notices.length - 1} more`}
								</button>
							{/if}
						{/snippet}
					</Banner>
				{/each}
			</div>
		{/if}
	{/if}

	<main id="main-content" class="flex-1 overflow-y-auto pb-16 sm:pb-0">
		{@render children()}
	</main>
	<!-- Not over the editor: it would cover its side panels -->
	{#if !focusMode.on && page.route.id !== '/(app)/projects/[id]/documents/[docId]'}
		<FeedbackButton />
	{/if}
	<footer class="hidden border-t border-paper-border px-6 py-3 {focusMode.on ? '' : 'sm:block'}">
		<p class="text-center font-sans text-xs text-ink-faint">
			Scholio Beta · Developed with
			<a
				href="https://claude.ai/code"
				target="_blank"
				rel="noopener noreferrer"
				class="underline decoration-dotted hover:text-ink-muted">Claude Code</a
			>
			· AI assistant powered by
			<span class="font-medium">Claude</span> (Anthropic)
		</p>
	</footer>
	<!-- Mobile bottom nav -->
	<MobileNav />
</div>
