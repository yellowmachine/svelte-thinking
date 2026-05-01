<script lang="ts">
	import { trpc } from '$lib/utils/trpc';
	import { type ProjectRole, PROJECT_ROLE_LABELS, INVITABLE_ROLES } from '$lib/domain/project';
	import type { CollaboratorRole } from '$lib/domain/permissions';
	type Invitation = {
		id: string;
		invitedEmail: string;
		role: ProjectRole;
		status: string;
		expiresAt: Date;
	};
	type Collaborator = {
		id: string;
		userId: string;
		role: ProjectRole;
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

	const roleOptions = INVITABLE_ROLES.map((r) => ({ value: r, label: PROJECT_ROLE_LABELS[r] }));

	let email = $state('');
	let role: CollaboratorRole = $state('reviewer');
	let reqState: 'idle' | 'sending' | 'sent' | 'info' | 'error' = $state('idle');
	let errorMsg = $state('');

	let changingRoleFor = $state<string | null>(null);
	let savedRoleFor = $state<string | null>(null);

	async function changeRole(userId: string, newRole: CollaboratorRole) {
		changingRoleFor = userId;
		try {
			await trpc.projects.changeRole.mutate({ projectId, userId, role: newRole });
			oninvited?.();
			savedRoleFor = userId;
			setTimeout(() => (savedRoleFor = null), 1500);
		} catch (e: unknown) {
			alert(e instanceof Error ? e.message : 'Failed to change role');
		} finally {
			changingRoleFor = null;
		}
	}

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
			const msg = e instanceof Error ? e.message : 'Failed to send the invitation';
			const isInfo = msg.includes('already a member') || msg.includes('pendiente');
			reqState = isInfo ? 'info' : 'error';
			errorMsg = msg;
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
					<p class="truncate text-sm text-ink dark:text-dark-ink">{c.name || c.email}</p>
					{#if c.role === 'owner'}
						<span class="ml-3 shrink-0 text-xs text-ink-faint dark:text-dark-ink-faint">Owner</span>
					{:else}
						<div class="ml-3 flex shrink-0 items-center gap-2">
							<select
								value={c.role}
								disabled={changingRoleFor === c.userId}
								onchange={(e) =>
									changeRole(
										c.userId,
										(e.currentTarget as HTMLSelectElement).value as CollaboratorRole
									)}
								class="rounded border px-1.5 py-0.5 text-xs transition-colors focus:outline-none disabled:opacity-50
									{savedRoleFor === c.userId
									? 'border-green-400 bg-green-50 text-green-700 dark:border-green-600 dark:bg-green-900/20 dark:text-green-400'
									: 'border-paper-border bg-paper text-ink-muted focus:border-accent dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink-muted'}"
							>
								{#each roleOptions as opt (opt.value)}
									<option value={opt.value}>{opt.label}</option>
								{/each}
							</select>
							<button
								onclick={() => remove(c.userId, c.name || c.email)}
								class="text-xs text-ink-faint transition-colors hover:text-red-600 dark:text-dark-ink-faint"
							>
								Remove…
							</button>
						</div>
					{/if}
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
	{:else if reqState === 'info'}
		<p class="mt-2 text-sm text-ink-muted dark:text-dark-ink-muted">{errorMsg}</p>
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
								{PROJECT_ROLE_LABELS[inv.role]} · expires {new Intl.DateTimeFormat('en', {
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
