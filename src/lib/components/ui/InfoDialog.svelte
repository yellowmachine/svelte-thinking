<script lang="ts">
	type Props = {
		open: boolean;
		title: string;
		message: string;
		actionLabel?: string;
		actionHref?: string;
		oncancel: () => void;
	};

	let { open, title, message, actionLabel, actionHref, oncancel }: Props = $props();

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') oncancel();
	}
</script>

{#if open}
	<!-- Backdrop -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
		onclick={(e) => {
			if (e.target === e.currentTarget) oncancel();
		}}
	>
		<!-- Dialog -->
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="info-dialog-title"
			tabindex="-1"
			onkeydown={handleKeydown}
			class="w-full max-w-sm rounded-xl border border-paper-border bg-paper shadow-xl dark:border-dark-paper-border dark:bg-dark-paper"
		>
			<div class="px-5 pt-5 pb-5">
				<h2
					id="info-dialog-title"
					class="font-serif text-base font-semibold text-ink dark:text-dark-ink"
				>
					{title}
				</h2>
				<p class="mt-2 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">{message}</p>

				<div class="mt-4 flex gap-3">
					<button
						type="button"
						onclick={oncancel}
						class="flex-1 rounded-lg border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
					>
						Cerrar
					</button>
					{#if actionLabel && actionHref}
						<!-- eslint-disable svelte/no-navigation-without-resolve -->
						<a
							href={actionHref}
							class="flex-1 rounded-lg bg-accent px-4 py-2 text-center font-sans text-sm font-medium text-white transition-opacity hover:opacity-90"
						>
							{actionLabel}
						</a>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}
