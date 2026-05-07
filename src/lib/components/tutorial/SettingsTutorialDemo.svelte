<script lang="ts">
	import TutorialManager from './TutorialManager.svelte';
	import { settingsTutorialSteps } from '$lib/tutorials/settings';

	interface Props {
		completed?: boolean;
	}

	let { completed = false }: Props = $props();

	const tabs = ['Perfil', 'AI Assistant', 'Security', 'Appearance', 'Organizations', 'Storage'];
	let activeTab = $state('Perfil');
</script>

<div class="min-h-screen bg-paper-ui dark:bg-dark-paper-ui">
	<div class="mx-auto max-w-3xl px-6 py-10">
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
			{#each tabs as tab (tab)}
				<button
					type="button"
					data-tutorial={tab === 'AI Assistant' ? 'settings-ai-tab' : undefined}
					onclick={() => (activeTab = tab)}
					class="px-4 pb-3 font-sans text-sm transition-colors {activeTab === tab
						? 'border-b-2 border-accent font-medium text-accent'
						: 'text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink'}"
				>
					{tab}
				</button>
			{/each}
		</div>

		<!-- Tab content -->
		<div
			class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper"
		>
			{#if activeTab === 'Perfil'}
				<h2 class="mb-4 font-serif text-lg font-semibold text-ink dark:text-dark-ink">Profile</h2>
				<div class="space-y-4">
					<div>
						<label
							for="demo-display-name"
							class="mb-1 block font-sans text-sm font-medium text-ink dark:text-dark-ink"
							>Display name</label
						>
						<input
							id="demo-display-name"
							type="text"
							value="Miguel Fernández"
							class="w-full rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
						/>
					</div>
					<div>
						<label
							for="demo-institution"
							class="mb-1 block font-sans text-sm font-medium text-ink dark:text-dark-ink"
							>Institution</label
						>
						<input
							id="demo-institution"
							type="text"
							value="Universidad Complutense de Madrid"
							class="w-full rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
						/>
					</div>
				</div>
			{:else if activeTab === 'AI Assistant'}
				<h2 class="mb-2 font-serif text-lg font-semibold text-ink dark:text-dark-ink">
					AI Assistant
				</h2>
				<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
					Connect an API key to enable writing assistance, draft generation, and citation tools.
				</p>
				<button
					class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white hover:bg-accent-hover"
				>
					Add API key
				</button>
			{:else}
				<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
					{activeTab} settings.
				</p>
			{/if}
		</div>

		{#if completed}
			<p class="mt-8 font-sans text-sm text-ink-muted italic dark:text-dark-ink-muted">
				Tutorial already completed — the tour will not launch.
			</p>
		{/if}
	</div>

	<TutorialManager
		slug="settings"
		completedTutorials={completed ? ['settings'] : []}
		steps={settingsTutorialSteps}
	/>
</div>
