<script lang="ts">
	import { trpc } from '$lib/utils/trpc';

	type Role = 'author' | 'coauthor' | 'reviewer' | 'commenter';
	type Invitation = {
		id: string;
		invitedEmail: string;
		role: Role;
		status: string;
		expiresAt: Date;
	};
	type Collaborator = {
		id: string;
		userId: string;
		role: Role;
		name: string;
		email: string;
	};

	let {
		projectId,
		invitations = [],
		collaborators = [],
		oninvited,
		onremove
	}: {
		projectId: string;
		invitations?: Invitation[];
		collaborators?: Collaborator[];
		oninvited?: () => void;
		onremove?: (collaborator: { userId: string; name: string }) => void;
	} = $props();

	const roleOptions: { value: Role; label: string }[] = [
		{ value: 'author', label: 'Author' },
		{ value: 'coauthor', label: 'Co-author' },
		{ value: 'reviewer', label: 'Reviewer' },
		{ value: 'commenter', label: 'Commenter' }
	];

	const roleLabel: Record<Role, string> = {
		author: 'Author',
		coauthor: 'Co-author',
		reviewer: 'Reviewer',
		commenter: 'Commenter'
	};

	let email = $state('');
	let role: Role = $state('reviewer');
	let reqState: 'idle' | 'sending' | 'sent' | 'error' = $state('idle');
	let errorMsg = $state('');

	async function invite() {
		if (!email.trim()) return;
		reqState = 'sending';
		errorMsg = '';
		try {
			await trpc.invitations.create.mutate({ projectId, invitedEmail: email.trim(), role });
			reqState = 'sent';
			email = '';
			oninvited?.();
			setTimeout(() => (reqState = 'idle'), 3000);
		} catch (e: unknown) {
			reqState = 'error';
			errorMsg = e instanceof Error ? e.message : 'Failed to send the invitation';
		}
	}

	async function cancel(invitationId: string) {
		await trpc.invitations.cancel.mutate(invitationId);
		oninvited?.();
	}

	function remove(userId: string, name: string) {
		onremove?.({ userId, name });
	}
</script>

<div class="font-sans">
	<h2 class="font-serif text-lg font-semibold text-ink dark:text-dark-ink">Collaborators</h2>

	{#if collaborators.length > 0}
		<ul class="mt-3 flex flex-col gap-1">
			{#each collaborators as c (c.id)}
				<li
					class="flex items-center justify-between rounded-lg border border-paper-border px-3 py-2 dark:border-dark-paper-border"
				>
					<div class="min-w-0">
						<p class="truncate text-sm text-ink dark:text-dark-ink">{c.name || c.email}</p>
						<p class="text-xs text-ink-faint dark:text-dark-ink-faint">{roleLabel[c.role]}</p>
					</div>
					<button
						onclick={() => remove(c.userId, c.name || c.email)}
						class="ml-3 shrink-0 text-xs text-ink-faint transition-colors hover:text-red-600 dark:text-dark-ink-faint"
					>
						Remove…
					</button>
				</li>
			{/each}
		</ul>
	{/if}

	<p class="mt-4 text-sm text-ink-muted dark:text-dark-ink-muted">Invite a new collaborator</p>

	<div class="mt-2 flex flex-col gap-3 sm:flex-row">
		<input
			type="email"
			bind:value={email}
			placeholder="email@example.com"
			class="flex-1 rounded-md border border-paper-border bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
		/>
		<select
			bind:value={role}
			class="rounded-md border border-paper-border bg-paper px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
		>
			{#each roleOptions as opt (opt.value)}
				<option value={opt.value}>{opt.label}</option>
			{/each}
		</select>
		<button
			onclick={invite}
			disabled={reqState === 'sending' || !email.trim()}
			class="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
		>
			{reqState === 'sending' ? 'Sending...' : 'Invite'}
		</button>
	</div>

	{#if reqState === 'sent'}
		<p class="mt-2 text-sm text-green-600">Invitation sent successfully.</p>
	{:else if reqState === 'error'}
		<p class="mt-2 text-sm text-red-600">{errorMsg}</p>
	{/if}

	{#if invitations.length > 0}
		<div class="mt-4">
			<p
				class="mb-2 text-xs font-medium tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint"
			>
				Pending acceptance
			</p>
			<ul class="flex flex-col gap-2">
				{#each invitations as inv (inv.id)}
					<li
						class="flex items-center justify-between rounded-lg border border-paper-border px-3 py-2 dark:border-dark-paper-border"
					>
						<div>
							<p class="text-sm text-ink dark:text-dark-ink">{inv.invitedEmail}</p>
							<p class="mt-0.5 text-xs text-ink-faint dark:text-dark-ink-faint">
								{roleLabel[inv.role]} · expires {new Intl.DateTimeFormat('en', {
									day: 'numeric',
									month: 'short'
								}).format(new Date(inv.expiresAt))}
							</p>
						</div>
						<button
							onclick={() => cancel(inv.id)}
							class="text-xs text-ink-faint transition-colors hover:text-red-600 dark:text-dark-ink-faint"
						>
							Cancel
						</button>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>
