<script lang="ts">
	import { toasts, type Toast } from '$lib/stores/flash.svelte';

	const STYLES: Record<Toast['type'], string> = {
		success:
			'border-green-200 bg-green-50 text-green-900 dark:border-green-800/60 dark:bg-green-950 dark:text-green-100',
		error:
			'border-red-200 bg-red-50 text-red-900 dark:border-red-800/60 dark:bg-red-950 dark:text-red-100',
		info: 'border-paper-border bg-paper text-ink dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink'
	};

	async function runAction(toast: Toast) {
		toasts.dismiss(toast.id);
		await toast.action?.run();
	}
</script>

<!-- Polite region for success/info; each error is announced as an alert. -->
<div
	class="pointer-events-none fixed inset-x-4 top-4 z-[60] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:top-16 sm:right-4 sm:w-96"
	aria-live="polite"
	aria-label="Notifications"
	role="region"
>
	{#each toasts.items as toast (toast.id)}
		<div
			role={toast.type === 'error' ? 'alert' : undefined}
			class="pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 font-sans text-sm shadow-lg {STYLES[
				toast.type
			]}"
		>
			<p class="min-w-0 flex-1 break-words">{toast.text}</p>
			{#if toast.action}
				<button
					type="button"
					onclick={() => runAction(toast)}
					class="shrink-0 font-semibold underline underline-offset-2 hover:no-underline"
				>
					{toast.action.label}
				</button>
			{/if}
			<button
				type="button"
				onclick={() => toasts.dismiss(toast.id)}
				aria-label="Dismiss notification"
				class="-m-1 shrink-0 rounded p-1 opacity-70 hover:opacity-100"
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M18 6L6 18M6 6l12 12"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
					/>
				</svg>
			</button>
		</div>
	{/each}
</div>
