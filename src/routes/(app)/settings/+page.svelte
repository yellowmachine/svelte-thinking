<script lang="ts">
	import type { PageData } from './$types';
	import { page } from '$app/stores';
	import ThemePicker from '$lib/components/layout/ThemePicker.svelte';
	import OrgSettings from '$lib/components/projects/OrgSettings.svelte';
	import ProfileTab from '$lib/components/settings/ProfileTab.svelte';
	import AiSettingsTab from '$lib/components/settings/AiSettingsTab.svelte';
	import SecurityTab from '$lib/components/settings/SecurityTab.svelte';
	import StorageTab from '$lib/components/settings/StorageTab.svelte';
	import BlogSettingsTab from '$lib/components/settings/BlogSettingsTab.svelte';
	import TutorialManager from '$lib/components/tutorial/TutorialManager.svelte';
	import { settingsTutorialSteps } from '$lib/tutorials/settings';

	let { data }: { data: PageData } = $props();

	const VALID_TABS = [
		'profile',
		'ai',
		'security',
		'appearance',
		'organizations',
		'storage',
		'blog'
	] as const;
	type Tab = (typeof VALID_TABS)[number];
	const initialTab = $page.url.searchParams.get('tab');
	let activeTab: Tab = $state(
		VALID_TABS.includes(initialTab as Tab) ? (initialTab as Tab) : 'profile'
	);
</script>

<div class="mx-auto max-w-3xl px-6 py-10">
	<!-- Header -->
	<div class="mb-8">
		<h1
			data-tutorial="settings-title"
			class="font-serif text-3xl font-semibold text-ink dark:text-dark-ink"
		>
			Settings
		</h1>
		<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Manage your account and preferences.
		</p>
	</div>

	<!-- Tabs -->
	<div
		data-tutorial="settings-tabs"
		class="mb-8 flex gap-1 border-b border-paper-border dark:border-dark-paper-border"
	>
		<button
			type="button"
			onclick={() => (activeTab = 'profile')}
			class="px-4 pb-3 font-sans text-sm transition-colors {activeTab === 'profile'
				? 'border-b-2 border-accent font-medium text-accent'
				: 'text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink'}"
		>
			Perfil
		</button>
		<button
			data-tutorial="settings-ai-tab"
			type="button"
			onclick={() => (activeTab = 'ai')}
			class="px-4 pb-3 font-sans text-sm transition-colors {activeTab === 'ai'
				? 'border-b-2 border-accent font-medium text-accent'
				: 'text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink'}"
		>
			AI Assistant
		</button>
		<button
			type="button"
			onclick={() => (activeTab = 'security')}
			class="px-4 pb-3 font-sans text-sm transition-colors {activeTab === 'security'
				? 'border-b-2 border-accent font-medium text-accent'
				: 'text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink'}"
		>
			Security
		</button>
		<button
			type="button"
			onclick={() => (activeTab = 'appearance')}
			class="px-4 pb-3 font-sans text-sm transition-colors {activeTab === 'appearance'
				? 'border-b-2 border-accent font-medium text-accent'
				: 'text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink'}"
		>
			Appearance
		</button>
		<button
			type="button"
			onclick={() => (activeTab = 'organizations')}
			class="px-4 pb-3 font-sans text-sm transition-colors {activeTab === 'organizations'
				? 'border-b-2 border-accent font-medium text-accent'
				: 'text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink'}"
		>
			Organizations
		</button>
		<button
			type="button"
			onclick={() => (activeTab = 'storage')}
			class="px-4 pb-3 font-sans text-sm transition-colors {activeTab === 'storage'
				? 'border-b-2 border-accent font-medium text-accent'
				: 'text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink'}"
		>
			Storage
		</button>
		<button
			type="button"
			onclick={() => (activeTab = 'blog')}
			class="px-4 pb-3 font-sans text-sm transition-colors {activeTab === 'blog'
				? 'border-b-2 border-accent font-medium text-accent'
				: 'text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink'}"
		>
			Blog
		</button>
	</div>

	{#if activeTab === 'profile'}
		<ProfileTab
			user={data.user}
			githubLinked={data.githubLinked}
			orcid={data.orcid}
			orcidVerified={data.orcidVerified}
			orcidStatus={data.orcidStatus as 'connected' | 'error' | null}
			isAdmin={data.isAdmin}
			displayName={data.displayName}
			bio={data.bio}
		/>
	{:else if activeTab === 'ai'}
		<AiSettingsTab openrouterStatus={data.openrouterStatus as 'success' | 'error' | null} />
	{:else if activeTab === 'security'}
		<SecurityTab twoFactorEnabled={data.user.twoFactorEnabled} />
	{:else if activeTab === 'appearance'}
		<div class="flex flex-col gap-8">
			<section
				class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper"
			>
				<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">Theme</h2>
				<p class="mb-6 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
					Choose a color scheme. Top row is light, bottom row is dark.
				</p>
				<ThemePicker />
			</section>
		</div>
	{:else if activeTab === 'organizations'}
		<div
			class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper"
		>
			<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">
				Organizations
			</h2>
			<p class="mb-6 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				Create or join organizations to collaborate on projects with a shared AI key.
			</p>
			<OrgSettings initialOrgs={data.orgs ?? []} />
		</div>
	{:else if activeTab === 'storage'}
		<StorageTab />
	{:else if activeTab === 'blog'}
		<BlogSettingsTab />
	{/if}
</div>

<TutorialManager
	slug="settings"
	completedTutorials={data.completedTutorials}
	steps={settingsTutorialSteps}
/>
