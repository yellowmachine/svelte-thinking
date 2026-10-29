<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	import { resolve } from '$app/paths';
	let { form, data }: { form: ActionData; data: PageData } = $props();

	let password = $state('');
	let confirmPassword = $state('');
	let passwordMismatch = $derived(confirmPassword.length > 0 && password !== confirmPassword);
</script>

<div
	class="rounded-2xl border border-paper-border bg-paper p-8 dark:border-dark-paper-border dark:bg-dark-paper"
>
	<h2 class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">Create account</h2>
	<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
		Already have an account?
		<button onclick={() => (window.location.href = '/login')} class="text-accent hover:underline"
			>Sign in</button
		>
	</p>

	<form method="post" action="?/signUpEmail" use:enhance class="mt-6 flex flex-col gap-4">
		<input type="hidden" name="token" value={data.token} />
		<div class="flex flex-col gap-1.5">
			<label for="name" class="font-sans text-sm font-medium text-ink dark:text-dark-ink"
				>Full name</label
			>
			<input
				id="name"
				type="text"
				name="name"
				required
				autocomplete="name"
				value={data.name ?? ''}
				class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
			/>
		</div>

		<div class="flex flex-col gap-1.5">
			<label for="email" class="font-sans text-sm font-medium text-ink dark:text-dark-ink"
				>Email</label
			>
			<input
				id="email"
				type="email"
				name="email"
				required
				readonly
				value={data.email}
				autocomplete="email"
				class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink opacity-70 focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
			/>
		</div>

		<div class="flex flex-col gap-1.5">
			<label for="password" class="font-sans text-sm font-medium text-ink dark:text-dark-ink"
				>Password</label
			>
			<input
				id="password"
				type="password"
				name="password"
				bind:value={password}
				required
				autocomplete="new-password"
				minlength={8}
				class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
			/>
		</div>

		<div class="flex flex-col gap-1.5">
			<label
				for="confirm-password"
				class="font-sans text-sm font-medium text-ink dark:text-dark-ink">Confirm password</label
			>
			<input
				id="confirm-password"
				type="password"
				bind:value={confirmPassword}
				required
				autocomplete="new-password"
				minlength={8}
				class="rounded-md border px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:outline-none dark:bg-dark-paper-ui dark:text-dark-ink
					{passwordMismatch
					? 'border-red-400 bg-red-50 focus:border-red-500 dark:border-red-700 dark:bg-red-950'
					: 'border-paper-border bg-paper-ui focus:border-accent dark:border-dark-paper-border'}"
			/>
			{#if passwordMismatch}
				<p class="font-sans text-xs text-red-500 dark:text-red-400">Passwords do not match.</p>
			{/if}
		</div>

		{#if form?.message}
			<p
				class="rounded-lg bg-red-50 px-4 py-3 font-sans text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
			>
				{form.message}
			</p>
		{/if}

		<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
			By signing up you agree to our
			<a
				href={resolve('/conduct')}
				target="_blank"
				class="underline underline-offset-2 hover:text-ink-muted dark:hover:text-dark-ink-muted"
				>code of conduct</a
			>
			and
			<a
				href={resolve('/privacy')}
				target="_blank"
				class="underline underline-offset-2 hover:text-ink-muted dark:hover:text-dark-ink-muted"
				>privacy policy</a
			>.
		</p>

		<button
			type="submit"
			disabled={passwordMismatch}
			class="rounded-md bg-accent px-4 py-2.5 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
		>
			Create account
		</button>
	</form>
</div>
