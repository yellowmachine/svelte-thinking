<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { form, data }: { form: ActionData; data: PageData } = $props();

	const token = $derived(form?.token ?? data.token);
</script>

<div
	class="rounded-2xl border border-paper-border bg-paper p-8 dark:border-dark-paper-border dark:bg-dark-paper"
>
	{#if form?.success}
		<div class="text-center">
			<div
				class="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-2xl"
			>
				✓
			</div>
			<h2 class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">
				Password updated
			</h2>
			<p class="mt-3 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				Your password has been reset. You can now sign in.
			</p>
			<a
				href="/login"
				class="mt-6 inline-block rounded-md bg-accent px-4 py-2.5 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover"
			>
				Sign in
			</a>
		</div>
	{:else}
		<h2 class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">New password</h2>
		<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Choose a new password for your account.
		</p>

		<form method="post" use:enhance class="mt-6 flex flex-col gap-4">
			<input type="hidden" name="token" value={token} />

			<div class="flex flex-col gap-1.5">
				<label for="newPassword" class="font-sans text-sm font-medium text-ink dark:text-dark-ink"
					>New password</label
				>
				<input
					id="newPassword"
					type="password"
					name="newPassword"
					required
					minlength="8"
					autocomplete="new-password"
					class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
				/>
			</div>

			<div class="flex flex-col gap-1.5">
				<label for="confirm" class="font-sans text-sm font-medium text-ink dark:text-dark-ink"
					>Confirm password</label
				>
				<input
					id="confirm"
					type="password"
					name="confirm"
					required
					minlength="8"
					autocomplete="new-password"
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
				Set new password
			</button>
		</form>
	{/if}
</div>
