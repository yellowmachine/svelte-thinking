<script lang="ts">
	import { browser } from '$app/environment';
	import { trpc } from '$lib/utils/trpc';
	import { type ProjectInvitationStatus, isInvitationExpired, isInvitationAccepted, isInvitationPending } from '$lib/domain/invitation';

	type Role = 'owner' | 'author' | 'coauthor' | 'reviewer' | 'commenter';

	let {
		data
	}: {
		data: {
			invitation: {
				id: string;
				role: Role;
				status: ProjectInvitationStatus;
				expiresAt: Date;
				projectId: string;
				invitedEmail: string;
				projectTitle: string | null;
				projectDescription: string | null;
			};
			token: string;
			user: { id: string; name: string; email: string } | null;
		};
	} = $props();

	const roleLabel: Record<Role, string> = {
		owner: 'Owner',
		author: 'Author',
		coauthor: 'Co-author',
		reviewer: 'Reviewer',
		commenter: 'Commenter'
	};

	let reqState: 'idle' | 'accepting' | 'success' | 'error' = $state('idle');
	let errorMsg = $state('');

	let isExpired = $derived(isInvitationExpired(data.invitation.expiresAt));
	let isAlreadyAccepted = $derived(isInvitationAccepted(data.invitation.status));
	let canAccept = $derived(
		!isExpired && !isAlreadyAccepted && isInvitationPending(data.invitation.status) && !!data.user
	);

	function navigate(path: string) {
		if (browser) window.location.href = path;
	}

	async function accept() {
		reqState = 'accepting';
		try {
			const result = await trpc.invitations.accept.mutate(data.token);
			reqState = 'success';
			if (browser) {
				setTimeout(() => (window.location.href = `/projects/${result.projectId}`), 1500);
			}
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
						Welcome to the project!
					</h1>
					<p class="mt-2 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
						Redirecting to project...
					</p>
				</div>

			{:else if isAlreadyAccepted}
				<div class="text-center">
					<h1 class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">
						Invitation already accepted
					</h1>
					<p class="mt-2 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
						You are already a collaborator on this project.
					</p>
					<button
						onclick={() => navigate(`/projects/${data.invitation.projectId}`)}
						class="mt-6 inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover"
					>
						Ir al proyecto
					</button>
				</div>

			{:else if isExpired || data.invitation.status === 'cancelled'}
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
						This link is no longer valid. Request a new invitation from the project owner.
					</p>
				</div>

			{:else}
				<div
					class="mb-1 font-sans text-xs font-medium uppercase tracking-widest text-ink-faint dark:text-dark-ink-faint"
				>
					Collaboration invitation
				</div>
				<h1 class="mt-2 font-serif text-2xl font-semibold text-ink dark:text-dark-ink">
					{data.invitation.projectTitle ?? 'Untitled project'}
				</h1>
				{#if data.invitation.projectDescription}
					<p class="mt-2 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
						{data.invitation.projectDescription}
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
							Role: <span class="font-medium text-accent">{roleLabel[data.invitation.role]}</span>
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
							onclick={() => navigate(`/login?redirect=/invitations/${data.token}`)}
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
