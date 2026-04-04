<div class="flex min-h-screen flex-col items-center justify-center gap-6 bg-paper px-6 text-center dark:bg-dark-paper">
	<svg width="48" height="48" viewBox="0 0 24 24" fill="none" class="text-ink-faint dark:text-dark-ink-faint" aria-hidden="true">
		<path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
	</svg>
	<div class="flex flex-col gap-2">
		<h1 class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">You're offline</h1>
		<p class="max-w-sm font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			This page isn't available offline. Check your connection and try again.
		</p>
	</div>
	<button
		type="button"
		onclick={() => window.location.reload()}
		class="rounded-lg border border-paper-border bg-paper-ui px-4 py-2 font-sans text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink dark:hover:border-accent dark:hover:text-accent"
	>
		Try again
	</button>
</div>
