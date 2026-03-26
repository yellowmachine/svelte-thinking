<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<div class="text-center">
	<div
		class="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-2xl"
	>
		✉️
	</div>
	<h1 class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">Check your email</h1>
	<p class="mt-3 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
		We've sent a verification link to<br />
		<span class="font-medium text-ink dark:text-dark-ink">{data.email}</span>
	</p>
	<p class="mt-4 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
		Can't find it? Check your spam folder.
	</p>
	<button
		onclick={() => (window.location.href = '/login')}
		class="mt-6 font-sans text-sm text-accent hover:underline"
	>
		Back to sign in
	</button>
</div>
