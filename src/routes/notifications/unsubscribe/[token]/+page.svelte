<script lang="ts">
	import type { PageData } from './$types';
	import { resolve } from '$app/paths';
	let { data }: { data: PageData } = $props();
</script>

<div class="flex min-h-screen items-center justify-center bg-paper px-4">
	<div class="max-w-md text-center">
		{#if data.alreadyUnsubscribed}
			<p class="font-serif text-xl text-ink">Already unsubscribed</p>
			<p class="mt-2 font-sans text-sm text-ink-muted">
				You will not receive email notifications (comments and new versions) from this project.
			</p>
		{:else}
			<p class="font-serif text-xl text-ink">Notifications muted</p>
			<p class="mt-2 font-sans text-sm text-ink-muted">
				You will no longer receive email notifications (comments and new versions) from this
				project.
			</p>
		{/if}
		<a
			href={resolve('/projects')}
			class="mt-6 inline-block font-sans text-sm text-accent-ink hover:underline"
		>
			Back to my projects
		</a>
	</div>
</div>
