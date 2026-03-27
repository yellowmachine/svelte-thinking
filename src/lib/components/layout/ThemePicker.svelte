<script lang="ts">
	import { themeStore, THEMES, type ThemeId } from '$lib/stores/theme.svelte';
	import { trpc } from '$lib/utils/trpc';

	let saving = $state(false);

	async function selectTheme(id: ThemeId, dark: boolean) {
		themeStore.set(id);
		themeStore.setDark(dark);
		if (saving) return;
		saving = true;
		try {
			await trpc.users.setTheme.mutate(id);
		} catch {
			// non-critical, preference already in localStorage
		} finally {
			saving = false;
		}
	}

	function isActive(id: ThemeId, dark: boolean) {
		return themeStore.id === id && themeStore.dark === dark;
	}
</script>

<div class="grid grid-cols-6 gap-2">
	{#each THEMES as theme (theme.id)}
		<div class="flex flex-col gap-1">
			<!-- Light swatch -->
			<button
				type="button"
				title="{theme.label} · Light"
				onclick={() => selectTheme(theme.id, false)}
				class="group relative h-9 w-full overflow-hidden rounded-md border-2 transition-all"
				style:border-color={isActive(theme.id, false) ? theme.light.accent : 'transparent'}
				style:outline={isActive(theme.id, false) ? `2px solid ${theme.light.accent}` : 'none'}
				style:outline-offset="1px"
			>
				<span
					class="absolute inset-0"
					style:background-color={theme.light.ui}
				></span>
				<!-- accent dot -->
				<span
					class="absolute bottom-1.5 right-1.5 h-2.5 w-2.5 rounded-full"
					style:background-color={theme.light.accent}
				></span>
				<!-- paper stripe -->
				<span
					class="absolute inset-x-0 top-0 h-4"
					style:background-color={theme.light.bg}
				></span>
			</button>

			<!-- Dark swatch -->
			<button
				type="button"
				title="{theme.label} · Dark"
				onclick={() => selectTheme(theme.id, true)}
				class="group relative h-9 w-full overflow-hidden rounded-md border-2 transition-all"
				style:border-color={isActive(theme.id, true) ? theme.dark.accent : 'transparent'}
				style:outline={isActive(theme.id, true) ? `2px solid ${theme.dark.accent}` : 'none'}
				style:outline-offset="1px"
			>
				<span
					class="absolute inset-0"
					style:background-color={theme.dark.ui}
				></span>
				<span
					class="absolute bottom-1.5 right-1.5 h-2.5 w-2.5 rounded-full"
					style:background-color={theme.dark.accent}
				></span>
				<span
					class="absolute inset-x-0 top-0 h-4"
					style:background-color={theme.dark.bg}
				></span>
			</button>

			<p class="truncate text-center font-sans text-[10px] text-ink-faint dark:text-dark-ink-faint">
				{theme.label}
			</p>
		</div>
	{/each}
</div>
