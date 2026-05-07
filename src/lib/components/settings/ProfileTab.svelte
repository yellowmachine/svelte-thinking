<script lang="ts">
	import { untrack } from 'svelte';
	import { trpc } from '$lib/utils/trpc';
	import { invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';

	let {
		user,
		githubLinked,
		orcid,
		orcidVerified,
		orcidStatus,
		isAdmin
	}: {
		user: { name: string; email: string };
		githubLinked: boolean;
		orcid: string | null;
		orcidVerified: boolean;
		orcidStatus: 'connected' | 'error' | null;
		isAdmin: boolean;
	} = $props();

	let unlinkingGitHub = $state(false);
	let unlinkGitHubError = $state('');
	let unlinkingOrcid = $state(false);

	let name = $state(untrack(() => user.name));
	let email = $state(untrack(() => user.email));
	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');
	let changingPassword = $state(false);
	let passwordError = $state('');
	let passwordSuccess = $state(false);

	let showDeleteDialog = $state(false);
	let deleteConfirmText = $state('');
	let deletingAccount = $state(false);
	let deleteError = $state('');
	const DELETE_KEYWORD = 'DELETE';

	async function unlinkOrcid() {
		unlinkingOrcid = true;
		try {
			await trpc.users.unlinkOrcid.mutate();
			await invalidateAll();
		} finally {
			unlinkingOrcid = false;
		}
	}

	async function handleDeleteAccount() {
		if (deleteConfirmText !== DELETE_KEYWORD) return;
		deletingAccount = true;
		deleteError = '';
		try {
			const res = await fetch('/api/account/delete', { method: 'DELETE' });
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.message ?? 'Error deleting account');
			}
			window.location.href = '/?deleted=1';
		} catch (e) {
			deleteError = e instanceof Error ? e.message : 'Unexpected error';
			deletingAccount = false;
		}
	}
</script>

<div class="flex flex-col gap-8">
	<!-- Personal info -->
	<section
		class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper"
	>
		<h2 class="mb-5 font-serif text-lg font-semibold text-ink dark:text-dark-ink">
			Personal information
		</h2>

		<div class="flex flex-col gap-4">
			<!-- Avatar placeholder -->
			<div class="flex items-center gap-4">
				<div
					class="flex h-16 w-16 items-center justify-center rounded-full bg-accent font-serif text-2xl font-semibold text-white"
				>
					{user.name
						.split(' ')
						.map((w: string) => w[0])
						.slice(0, 2)
						.join('')
						.toUpperCase()}
				</div>
				<div>
					<button
						type="button"
						disabled
						class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted opacity-50 dark:border-dark-paper-border dark:text-dark-ink-muted"
					>
						Change photo
					</button>
					<p class="mt-1 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">Coming soon</p>
				</div>
			</div>

			<div class="grid gap-4 sm:grid-cols-2">
				<div class="flex flex-col gap-1.5">
					<label for="name" class="font-sans text-sm font-medium text-ink dark:text-dark-ink">
						Name
					</label>
					<input
						id="name"
						type="text"
						bind:value={name}
						class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
					/>
				</div>

				<div class="flex flex-col gap-1.5">
					<label for="email" class="font-sans text-sm font-medium text-ink dark:text-dark-ink">
						Email
					</label>
					<input
						id="email"
						type="email"
						bind:value={email}
						readonly
						class="cursor-default rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink opacity-60 focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
					/>
					{#if isAdmin}
						<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
							Managed by environment config (<code class="font-mono">ADMIN_EMAIL</code>).
						</p>
					{:else}
						<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
							El email no puede modificarse. Si necesitas cambiarlo, contacta con soporte.
						</p>
					{/if}
				</div>
			</div>

			<div class="flex justify-end">
				<button
					type="button"
					disabled
					class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white opacity-50"
				>
					Save changes
				</button>
			</div>
		</div>
	</section>

	<!-- Connected accounts -->
	<section
		class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper"
	>
		<h2 class="mb-5 font-serif text-lg font-semibold text-ink dark:text-dark-ink">
			Connected accounts
		</h2>

		<div class="flex items-center justify-between gap-4">
			<div class="flex items-center gap-3">
				<svg
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="currentColor"
					aria-hidden="true"
					class="shrink-0 text-ink dark:text-dark-ink"
				>
					<path
						d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"
					/>
				</svg>
				<div>
					<p class="font-sans text-sm font-medium text-ink dark:text-dark-ink">GitHub</p>
					{#if githubLinked}
						<p class="font-sans text-xs text-green-600 dark:text-green-400">Connected</p>
					{:else}
						<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">Not connected</p>
					{/if}
				</div>
			</div>

			{#if githubLinked}
				<div class="flex flex-col items-end gap-1.5">
					<div class="flex items-center gap-2">
						<span
							class="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 font-sans text-xs font-medium text-green-700 dark:bg-green-900/20 dark:text-green-400"
						>
							<svg
								width="12"
								height="12"
								viewBox="0 0 20 20"
								fill="currentColor"
								aria-hidden="true"
							>
								<path
									fill-rule="evenodd"
									d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
									clip-rule="evenodd"
								/>
							</svg>
							Linked
						</span>
						<form
							method="post"
							action="?/unlinkGitHub"
							use:enhance={() => {
								unlinkingGitHub = true;
								unlinkGitHubError = '';
								return async ({ result, update }) => {
									unlinkingGitHub = false;
									if (result.type === 'failure') {
										unlinkGitHubError =
											(result.data as { message?: string })?.message ?? 'Error unlinking account';
									} else {
										await update();
										await invalidateAll();
									}
								};
							}}
						>
							<button
								type="submit"
								disabled={unlinkingGitHub}
								class="font-sans text-xs text-ink-faint underline underline-offset-2 transition-colors hover:text-red-500 disabled:opacity-50 dark:text-dark-ink-faint dark:hover:text-red-400"
							>
								{unlinkingGitHub ? 'Unlinking…' : 'Unlink'}
							</button>
						</form>
					</div>
					{#if unlinkGitHubError}
						<p class="font-sans text-xs text-red-500 dark:text-red-400">{unlinkGitHubError}</p>
					{/if}
				</div>
			{:else}
				<form method="post" action="?/linkGitHub">
					<button
						type="submit"
						class="inline-flex items-center gap-2 rounded-lg border border-paper-border bg-paper-ui px-4 py-2 font-sans text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink dark:hover:border-accent dark:hover:text-accent"
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
							<path
								d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"
							/>
						</svg>
						Connect GitHub
					</button>
				</form>
			{/if}
		</div>
	</section>

	<!-- ORCID -->
	<section
		class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper"
	>
		<div class="mb-4 flex items-start justify-between gap-4">
			<div>
				<h2 class="font-serif text-lg font-semibold text-ink dark:text-dark-ink">ORCID</h2>
				<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
					Connect your ORCID account to verify your academic identity.
				</p>
			</div>
			<svg
				width="32"
				height="32"
				viewBox="0 0 24 24"
				fill="#A6CE39"
				aria-hidden="true"
				class="shrink-0"
			>
				<path
					d="M12 0C5.372 0 0 5.372 0 12s5.372 12 12 12 12-5.372 12-12S18.628 0 12 0zM7.369 4.378c.525 0 .947.431.947.947s-.422.947-.947.947a.95.95 0 0 1-.947-.947c0-.525.422-.947.947-.947zm-.722 3.038h1.444v10.041H6.647V7.416zm3.562 0h3.9c3.712 0 5.344 2.653 5.344 5.025 0 2.578-2.016 5.016-5.325 5.016h-3.919V7.416zm1.444 1.303v7.444h2.297c3.272 0 3.872-2.484 3.872-3.722 0-2.016-1.284-3.722-3.884-3.722h-2.285z"
				/>
			</svg>
		</div>

		{#if orcidStatus === 'connected'}
			<p
				class="mb-4 rounded-lg bg-green-50 px-4 py-2 font-sans text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400"
			>
				ORCID connected successfully.
			</p>
		{:else if orcidStatus === 'error'}
			<p
				class="mb-4 rounded-lg bg-red-50 px-4 py-2 font-sans text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400"
			>
				Error connecting ORCID. Please try again.
			</p>
		{/if}

		{#if orcid && orcidVerified}
			<div
				class="flex items-center justify-between gap-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 dark:border-green-800/40 dark:bg-green-900/10"
			>
				<div class="flex items-center gap-2">
					<svg
						width="16"
						height="16"
						viewBox="0 0 20 20"
						fill="currentColor"
						class="shrink-0 text-green-600 dark:text-green-400"
					>
						<path
							fill-rule="evenodd"
							d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
							clip-rule="evenodd"
						/>
					</svg>
					<span class="font-sans text-sm font-medium text-green-700 dark:text-green-400"
						>Verified</span
					>
					<span class="font-mono text-sm text-ink dark:text-dark-ink">{orcid}</span>
				</div>
				<div class="flex items-center gap-3">
					<a
						href="/api/orcid/connect"
						class="font-sans text-xs text-ink-muted underline hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
					>
						Reconnect
					</a>
					<button
						onclick={unlinkOrcid}
						disabled={unlinkingOrcid}
						class="font-sans text-xs text-red-600 underline hover:text-red-800 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
					>
						{unlinkingOrcid ? 'Unlinking…' : 'Unlink'}
					</button>
				</div>
			</div>
		{:else}
			{#if orcid}
				<p class="mb-3 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
					Current ORCID (unverified): <span class="font-mono">{orcid}</span>
				</p>
			{/if}
			<a
				href="/api/orcid/connect"
				class="inline-flex items-center gap-2 rounded-lg border border-paper-border bg-paper-ui px-4 py-2 font-sans text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink dark:hover:border-accent dark:hover:text-accent"
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="#A6CE39" aria-hidden="true">
					<path
						d="M12 0C5.372 0 0 5.372 0 12s5.372 12 12 12 12-5.372 12-12S18.628 0 12 0zM7.369 4.378c.525 0 .947.431.947.947s-.422.947-.947.947a.95.95 0 0 1-.947-.947c0-.525.422-.947.947-.947zm-.722 3.038h1.444v10.041H6.647V7.416zm3.562 0h3.9c3.712 0 5.344 2.653 5.344 5.025 0 2.578-2.016 5.016-5.325 5.016h-3.919V7.416zm1.444 1.303v7.444h2.297c3.272 0 3.872-2.484 3.872-3.722 0-2.016-1.284-3.722-3.884-3.722h-2.285z"
					/>
				</svg>
				Connect with ORCID
			</a>
		{/if}
	</section>

	<!-- Change password -->
	<section
		class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper"
	>
		<h2 class="mb-5 font-serif text-lg font-semibold text-ink dark:text-dark-ink">
			Change password
		</h2>

		<form
			method="POST"
			action="?/changePassword"
			use:enhance={() => {
				changingPassword = true;
				passwordError = '';
				passwordSuccess = false;
				return async ({ result, update }) => {
					changingPassword = false;
					if (result.type === 'failure') {
						passwordError = String(result.data?.passwordError ?? 'Error changing password.');
					} else if (result.type === 'success') {
						passwordSuccess = true;
						currentPassword = '';
						newPassword = '';
						confirmPassword = '';
					}
					await update({ reset: false });
				};
			}}
			class="flex flex-col gap-4"
		>
			<div class="flex flex-col gap-1.5">
				<label
					for="current-password"
					class="font-sans text-sm font-medium text-ink dark:text-dark-ink"
				>
					Current password
				</label>
				<input
					id="current-password"
					name="currentPassword"
					type="password"
					bind:value={currentPassword}
					placeholder="••••••••"
					class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
				/>
			</div>

			<div class="grid gap-4 sm:grid-cols-2">
				<div class="flex flex-col gap-1.5">
					<label
						for="new-password"
						class="font-sans text-sm font-medium text-ink dark:text-dark-ink"
					>
						New password
					</label>
					<input
						id="new-password"
						name="newPassword"
						type="password"
						bind:value={newPassword}
						placeholder="••••••••"
						class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
					/>
				</div>
				<div class="flex flex-col gap-1.5">
					<label
						for="confirm-password"
						class="font-sans text-sm font-medium text-ink dark:text-dark-ink"
					>
						Confirm password
					</label>
					<input
						id="confirm-password"
						name="confirmPassword"
						type="password"
						bind:value={confirmPassword}
						placeholder="••••••••"
						class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
					/>
				</div>
			</div>

			{#if passwordError}
				<p class="font-sans text-sm text-red-600 dark:text-red-400">{passwordError}</p>
			{/if}
			{#if passwordSuccess}
				<p class="font-sans text-sm text-green-600 dark:text-green-400">
					Password updated successfully.
				</p>
			{/if}

			<div class="flex justify-end">
				<button
					type="submit"
					disabled={changingPassword}
					class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-opacity disabled:opacity-50"
				>
					{changingPassword ? 'Updating…' : 'Update password'}
				</button>
			</div>
		</form>
	</section>

	<!-- Danger zone -->
	<div
		class="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-900 dark:bg-red-950/30"
	>
		<h2 class="font-serif text-lg font-semibold text-red-700 dark:text-red-400">Danger zone</h2>
		<p class="mt-1 font-sans text-sm text-red-600 dark:text-red-500">
			These actions are permanent and irreversible.
		</p>
		<div
			class="mt-4 flex items-center justify-between rounded-lg border border-red-200 bg-white p-4 dark:border-red-900 dark:bg-dark-paper"
		>
			<div>
				<p class="font-sans text-sm font-medium text-ink dark:text-dark-ink">Delete account</p>
				<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					Permanently deletes your account, all projects, documents and files.
				</p>
			</div>
			<button
				type="button"
				onclick={() => (showDeleteDialog = true)}
				class="ml-4 shrink-0 rounded-md border border-red-300 px-4 py-2 font-sans text-sm font-medium text-red-700 transition-colors hover:bg-red-100 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30"
			>
				Delete account
			</button>
		</div>
	</div>
</div>

<!-- Delete account confirmation dialog -->
{#if showDeleteDialog}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
		role="dialog"
		aria-modal="true"
		aria-labelledby="delete-dialog-title"
	>
		<div
			class="w-full max-w-md rounded-2xl border border-paper-border bg-paper p-6 shadow-xl dark:border-dark-paper-border dark:bg-dark-paper"
		>
			<h3
				id="delete-dialog-title"
				class="font-serif text-xl font-semibold text-ink dark:text-dark-ink"
			>
				Delete your account?
			</h3>
			<p class="mt-2 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				This action will permanently delete your account and <strong>all your data</strong>:
				projects, documents, version history, comments and files. This cannot be undone.
			</p>

			<div class="mt-5">
				<label
					for="delete-confirm"
					class="block font-sans text-sm font-medium text-ink dark:text-dark-ink"
				>
					Type <span class="font-mono font-bold">{DELETE_KEYWORD}</span> to confirm
				</label>
				<input
					id="delete-confirm"
					type="text"
					bind:value={deleteConfirmText}
					placeholder={DELETE_KEYWORD}
					class="mt-2 w-full rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-faint focus:border-red-400 focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
				/>
			</div>

			{#if deleteError}
				<p class="mt-3 font-sans text-sm text-red-600 dark:text-red-400">{deleteError}</p>
			{/if}

			<div class="mt-5 flex gap-3">
				<button
					type="button"
					onclick={() => {
						showDeleteDialog = false;
						deleteConfirmText = '';
						deleteError = '';
					}}
					disabled={deletingAccount}
					class="flex-1 rounded-md border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui disabled:opacity-50 dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
				>
					Cancelar
				</button>
				<button
					type="button"
					onclick={handleDeleteAccount}
					disabled={deleteConfirmText !== DELETE_KEYWORD || deletingAccount}
					class="flex-1 rounded-md bg-red-600 px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-40"
				>
					{deletingAccount ? 'Deleting...' : 'Delete forever'}
				</button>
			</div>
		</div>
	</div>
{/if}
