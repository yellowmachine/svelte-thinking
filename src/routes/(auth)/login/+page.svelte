<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	import { resolve } from '$app/paths';
	let { form, data }: { form: ActionData; data: PageData } = $props();

	// When the server returns twoFactor: true, show the TOTP step
	let showTotpStep = $derived(form && 'twoFactor' in form && form.twoFactor === true);
</script>

<div class="rounded-2xl border border-paper-border bg-paper p-8">
	{#if showTotpStep}
		<!-- ── 2FA Step ── -->
		<h2 class="font-serif text-2xl font-semibold text-ink">Two-step verification</h2>
		<p class="mt-1 font-sans text-sm text-ink-muted">
			Enter the 6-digit code from your authenticator app.
		</p>

		<form method="post" action="?/verifyTotp" use:enhance class="mt-6 flex flex-col gap-4">
			<div class="flex flex-col gap-1.5">
				<label for="code" class="font-sans text-sm font-medium text-ink">TOTP code</label>
				<input
					id="code"
					type="text"
					name="code"
					required
					autocomplete="one-time-code"
					inputmode="numeric"
					pattern="[0-9]*"
					maxlength="6"
					placeholder="000000"
					class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 text-center font-mono text-lg tracking-widest text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
				/>
			</div>

			{#if form?.message}
				<p class="rounded-lg bg-danger-bg px-4 py-3 font-sans text-sm text-danger">
					{form.message}
				</p>
			{/if}

			<button
				type="submit"
				class="mt-1 rounded-md bg-accent px-4 py-2.5 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover"
			>
				Verify
			</button>
		</form>

		<button
			type="button"
			onclick={() => window.location.reload()}
			class="mt-4 w-full text-center font-sans text-sm text-ink-muted hover:text-ink"
		>
			← Back to sign in
		</button>
	{:else}
		<!-- ── Email/Password Step ── -->
		<h2 class="font-serif text-2xl font-semibold text-ink">Sign in</h2>
		<p class="mt-1 font-sans text-sm text-ink-muted">
			Don't have an account?
			<button
				onclick={() => (window.location.href = '/#waitlist')}
				class="text-accent-ink hover:underline">Sign up</button
			>
		</p>

		{#if data.welcome}
			<div
				class="mt-4 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 font-sans text-sm text-accent-ink"
			>
				Your Scholio access is ready. Sign in with your credentials.
			</div>
		{/if}

		<form method="post" action="?/signInEmail" use:enhance class="mt-6 flex flex-col gap-4">
			<div class="flex flex-col gap-1.5">
				<label for="email" class="font-sans text-sm font-medium text-ink">Email</label>
				<input
					id="email"
					type="email"
					name="email"
					required
					autocomplete="email"
					value={data.prefillEmail ?? ''}
					class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
				/>
			</div>

			<div class="flex flex-col gap-1.5">
				<div class="flex items-center justify-between">
					<label for="password" class="font-sans text-sm font-medium text-ink">Password</label>
					<a
						href={resolve('/forgot-password')}
						tabindex="-1"
						class="font-sans text-xs text-ink-muted hover:text-ink">Forgot password?</a
					>
				</div>
				<input
					id="password"
					type="password"
					name="password"
					required
					autocomplete="current-password"
					class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
				/>
			</div>

			{#if form?.message}
				<p class="rounded-lg bg-danger-bg px-4 py-3 font-sans text-sm text-danger">
					{form.message}
				</p>
			{/if}

			<button
				type="submit"
				class="mt-1 rounded-md bg-accent px-4 py-2.5 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover"
			>
				Sign in
			</button>
		</form>

		{#if data.seilide}
			<div class="relative my-6 flex items-center">
				<div class="flex-1 border-t border-paper-border"></div>
				<span class="mx-3 font-sans text-xs text-ink-faint">or continue with</span>
				<div class="flex-1 border-t border-paper-border"></div>
			</div>

			<form method="post" action="?/signInSeilide" use:enhance>
				<button
					type="submit"
					class="flex w-full items-center justify-center gap-2.5 rounded-md border border-paper-border bg-paper px-4 py-2.5 font-sans text-sm font-medium text-ink transition-colors hover:bg-paper-ui"
				>
					Continue with Seilide
				</button>
			</form>
		{/if}
	{/if}
</div>
