<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<div
	class="rounded-2xl border border-paper-border bg-paper p-8 dark:border-dark-paper-border dark:bg-dark-paper"
>
	{#if form?.sent}
		<div class="text-center">
			<div
				class="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-2xl"
			>
				✉️
			</div>
			<h2 class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">
				Check your email
			</h2>
			<p class="mt-3 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				If an account exists for <span class="font-medium text-ink dark:text-dark-ink"
					>{form.email}</span
				>, we've sent a link to reset your password.
			</p>
			<p class="mt-4 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
				Can't find it? Check your spam folder.
			</p>
			<a href="/login" class="mt-6 inline-block font-sans text-sm text-accent hover:underline">
				Back to sign in
			</a>
		</div>
	{:else}
		<h2 class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">Reset password</h2>
		<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Enter your email and we'll send you a reset link.
		</p>

		<form method="post" use:enhance class="mt-6 flex flex-col gap-4">
			<div class="flex flex-col gap-1.5">
				<label for="email" class="font-sans text-sm font-medium text-ink dark:text-dark-ink"
					>Email</label
				>
				<input
					id="email"
					type="email"
					name="email"
					required
					autocomplete="email"
					class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
				/>
			</div>

			{#if form?.message}
				<p
					class="rounded-lg bg-red-50 px-4 py-3 font-sans text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
				>
					{form.message}
				</p>
			{/if}

			<button
				type="submit"
				class="mt-1 rounded-md bg-accent px-4 py-2.5 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover"
			>
				Send reset link
			</button>
		</form>

		<a
			href="/login"
			class="mt-6 block text-center font-sans text-sm text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
		>
			Back to sign in
		</a>
	{/if}
</div>
