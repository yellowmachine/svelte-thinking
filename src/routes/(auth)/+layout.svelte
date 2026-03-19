<script lang="ts">
	let { children } = $props();
</script>

<div class="flex min-h-screen flex-col items-center justify-center bg-paper-ui px-4 py-12 dark:bg-dark-paper-ui">
	<div class="mb-8 text-center">
		<h1 class="font-serif text-3xl font-semibold text-ink dark:text-dark-ink">Scholio</h1>
		<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Escritura académica colaborativa
		</p>
	</div>

	<div class="w-full max-w-sm">
		{@render children()}
	</div>
</div>
