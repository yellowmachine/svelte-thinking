<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<div class="flex min-h-screen items-center justify-center bg-paper px-4 dark:bg-dark-paper">
	<div class="max-w-md text-center">
		{#if data.alreadyUnsubscribed}
			<p class="font-serif text-xl text-ink dark:text-dark-ink">Already unsubscribed</p>
			<p class="mt-2 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				You will not receive comment notifications from this project.
			</p>
		{:else}
			<p class="font-serif text-xl text-ink dark:text-dark-ink">Notifications muted</p>
			<p class="mt-2 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				You will no longer receive comment email notifications from this project.
			</p>
		{/if}
		<a href="/projects" class="mt-6 inline-block font-sans text-sm text-accent hover:underline">
			Back to my projects
		</a>
	</div>
</div>
