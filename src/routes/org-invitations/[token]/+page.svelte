<script lang="ts">
	import { browser } from '$app/environment';
	import { trpc } from '$lib/utils/trpc';
	import {
		type OrgInvitationStatus,
		isInvitationExpired,
		isInvitationAccepted,
		isInvitationPending
	} from '$lib/domain/invitation';

	let {
		data
	}: {
		data: {
			invitation: {
				id: string;
				status: OrgInvitationStatus;
				expiresAt: Date;
				orgId: string;
				orgName: string | null;
				invitedEmail: string;
				orgSlug: string | null;
			};
			token: string;
			user: { id: string; name: string; email: string } | null;
		};
	} = $props();

	let reqState: 'idle' | 'accepting' | 'success' | 'error' = $state('idle');
	let errorMsg = $state('');

	const isExpired = $derived(isInvitationExpired(data.invitation.expiresAt));
	const isAlreadyAccepted = $derived(isInvitationAccepted(data.invitation.status));
	const canAccept = $derived(
		!isExpired && !isAlreadyAccepted && isInvitationPending(data.invitation.status) && !!data.user
	);

	function navigate(path: string) {
		if (browser) window.location.href = path;
	}

	async function accept() {
		reqState = 'accepting';
		try {
			await trpc.orgs.acceptInvite.mutate(data.token);
			reqState = 'success';
			if (browser) setTimeout(() => navigate('/projects'), 1500);
		} catch (e: unknown) {
			reqState = 'error';
			errorMsg = e instanceof Error ? e.message : 'Error accepting invitation';
		}
	}
</script>

<div class="flex min-h-screen items-center justify-center bg-paper-ui px-4 dark:bg-dark-paper-ui">
	<div class="w-full max-w-md">
		<div
			class="rounded-2xl border border-paper-border bg-paper p-8 dark:border-dark-paper-border dark:bg-dark-paper"
		>
			{#if reqState === 'success'}
				<div class="text-center">
					<div
						class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100"
					>
						<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
							<path
								d="M5 13l4 4L19 7"
								stroke="#16a34a"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					</div>
					<h1 class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">
						Welcome to {data.invitation.orgName ?? 'the organization'}!
					</h1>
					<p class="mt-2 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
						Redirecting to your projects...
					</p>
				</div>
			{:else if isAlreadyAccepted}
				<div class="text-center">
					<h1 class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">
						Already a member
					</h1>
					<p class="mt-2 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
						You are already a member of {data.invitation.orgName ?? 'this organization'}.
					</p>
					<button
						onclick={() => navigate('/projects')}
						class="mt-6 inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover"
					>
						Go to projects
					</button>
				</div>
			{:else if isExpired || data.invitation.status === 'rejected'}
				<div class="text-center">
					<div
						class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-paper-border dark:bg-dark-paper-border"
					>
						<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
							<circle
								cx="12"
								cy="12"
								r="9"
								stroke="currentColor"
								stroke-width="1.5"
								class="text-ink-faint dark:text-dark-ink-faint"
							/>
							<path
								d="M12 8v4M12 16h.01"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
								class="text-ink-faint dark:text-dark-ink-faint"
							/>
						</svg>
					</div>
					<h1 class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">
						Invitation expired
					</h1>
					<p class="mt-2 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
						This link is no longer valid. Ask the organization owner to send a new invitation.
					</p>
				</div>
			{:else}
				<div
					class="mb-1 font-sans text-xs font-medium tracking-widest text-ink-faint uppercase dark:text-dark-ink-faint"
				>
					Organization invitation
				</div>
				<h1 class="mt-2 font-serif text-2xl font-semibold text-ink dark:text-dark-ink">
					{data.invitation.orgName ?? 'Organization'}
				</h1>
				{#if data.invitation.orgSlug}
					<p class="mt-0.5 font-sans text-sm text-ink-faint dark:text-dark-ink-faint">
						/{data.invitation.orgSlug}
					</p>
				{/if}

				<div
					class="mt-5 flex items-center gap-3 rounded-lg bg-paper-ui px-4 py-3 dark:bg-dark-paper-ui"
				>
					<div
						class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent font-sans text-xs font-semibold text-white"
					>
						{data.invitation.invitedEmail[0].toUpperCase()}
					</div>
					<div>
						<p class="font-sans text-sm text-ink dark:text-dark-ink">
							{data.invitation.invitedEmail}
						</p>
						<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
							Invited as <span class="font-medium text-accent">member</span>
						</p>
					</div>
				</div>

				{#if reqState === 'error'}
					<p class="mt-4 rounded-lg bg-red-50 px-4 py-3 font-sans text-sm text-red-700">
						{errorMsg}
					</p>
				{/if}

				<div class="mt-6 flex flex-col gap-3">
					{#if !data.user}
						<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
							You need to sign in to accept this invitation.
						</p>
						<button
							onclick={() => navigate(`/login?redirect=/org-invitations/${data.token}`)}
							class="flex items-center justify-center rounded-md bg-accent px-4 py-2.5 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover"
						>
							Sign in to accept
						</button>
					{:else if canAccept}
						<button
							onclick={accept}
							disabled={reqState === 'accepting'}
							class="flex items-center justify-center rounded-md bg-accent px-4 py-2.5 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
						>
							{reqState === 'accepting' ? 'Accepting...' : 'Accept invitation'}
						</button>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>
