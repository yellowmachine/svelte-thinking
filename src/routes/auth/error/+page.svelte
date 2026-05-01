<script lang="ts">
	import { page } from '$app/state';

	const ERROR_MESSAGES: Record<string, { title: string; description: string }> = {
		"email_doesn't_match": {
			title: 'Email mismatch',
			description:
				'The email address from your social account does not match the one registered in Scholio. Make sure you are using the primary email of your social account, or log in with your password instead.'
		},
		account_not_linked: {
			title: 'Account not linked',
			description:
				'This social account is not linked to any Scholio account. Try logging in with your email and password first, then link your social account from settings.'
		},
		default: {
			title: 'Authentication error',
			description:
				'Something went wrong during sign-in. Please try again or contact support if the problem persists.'
		}
	};

	const errorCode = $derived(page.url.searchParams.get('error') ?? 'default');
	const { title, description } = $derived(ERROR_MESSAGES[errorCode] ?? ERROR_MESSAGES.default);
</script>

<svelte:head>
	<title>Sign-in error — Scholio</title>
</svelte:head>

<main class="flex min-h-screen items-center justify-center bg-paper px-6 dark:bg-dark-paper">
	<div class="w-full max-w-md">
		<a href="/" class="mb-8 block font-serif text-2xl font-semibold text-ink dark:text-dark-ink">
			Scholio
		</a>

		<div
			class="rounded-xl border border-paper-border bg-white p-8 dark:border-dark-paper-border dark:bg-dark-paper"
		>
			<div
				class="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-red-50 dark:bg-red-900/20"
			>
				<svg
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					class="text-red-500 dark:text-red-400"
					aria-hidden="true"
				>
					<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.75" />
					<path
						d="M12 8v4M12 16h.01"
						stroke="currentColor"
						stroke-width="1.75"
						stroke-linecap="round"
					/>
				</svg>
			</div>

			<h1 class="mb-2 font-serif text-xl font-semibold text-ink dark:text-dark-ink">{title}</h1>
			<p class="mb-6 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
				{description}
			</p>

			{#if errorCode !== 'default'}
				<p class="mb-6 font-mono text-xs text-ink-faint dark:text-dark-ink-faint">
					Code: {errorCode}
				</p>
			{/if}

			<div class="flex gap-3">
				<a
					href="/login"
					class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover"
				>
					Back to login
				</a>
				<a
					href="/"
					class="rounded-md border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
				>
					Home
				</a>
			</div>
		</div>
	</div>
</main>
