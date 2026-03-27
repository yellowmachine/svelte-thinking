<script lang="ts">
	import { trpc } from '$lib/utils/trpc';
	import { AI_TASKS, MODELS } from '$lib/server/trpc/routers/aiConfig';

	type Org = { id: string; name: string; slug: string; role: string };

	let { initialOrgs }: { initialOrgs: Org[] } = $props();

	// ── State ────────────────────────────────────────────────────────────────
	let orgs = $state<Org[]>(initialOrgs);
	let selectedOrgId = $state<string | null>(orgs[0]?.id ?? null);

	// Create org form
	let createName = $state('');
	let creating = $state(false);
	let createError = $state('');

	// Org detail state
	let members = $state<{ id: string; userId: string; role: string; createdAt: Date }[]>([]);
	let invitations = $state<{ id: string; invitedEmail: string; status: string; expiresAt: Date }[]>([]);
	let keys = $state<{ id: string; name: string; enabled: boolean; createdAt: Date }[]>([]);
	let monthlyUsage = $state<{ totalEur: string; since: Date } | null>(null);
	let taskConfig = $state<Record<string, { keyId: string; model: string }>>({});
	let orgData = $state<{ monthlyBudgetEur: string | null; ownerId: string } | null>(null);

	let loadingDetail = $state(false);

	// Invite form
	let inviteEmail = $state('');
	let inviting = $state(false);
	let inviteError = $state('');

	// Key form
	let newKeyName = $state('');
	let newKeyValue = $state('');
	let addingKey = $state(false);
	let keyError = $state('');

	// Budget form
	let budgetInput = $state('');
	let savingBudget = $state(false);

	// ── Derived ──────────────────────────────────────────────────────────────
	const selectedOrg = $derived(orgs.find((o) => o.id === selectedOrgId) ?? null);
	const isOwner = $derived(selectedOrg?.role === 'owner');

	// ── Load org detail ───────────────────────────────────────────────────────
	async function loadDetail(orgId: string) {
		loadingDetail = true;
		try {
			const [m, inv, k, usage, org] = await Promise.all([
				trpc.orgs.listMembers.query(orgId),
				trpc.orgs.listInvitations.query(orgId),
				trpc.orgs.listKeys.query(orgId),
				trpc.orgs.getMonthlyUsage.query(orgId),
				trpc.orgs.get.query(orgId)
			]);
			members = m as typeof members;
			invitations = inv as typeof invitations;
			keys = k as typeof keys;
			monthlyUsage = usage as typeof monthlyUsage;
			orgData = { monthlyBudgetEur: org.monthlyBudgetEur, ownerId: org.ownerId };
			budgetInput = org.monthlyBudgetEur ?? '';
			try {
				taskConfig = org.aiTaskConfig ? JSON.parse(org.aiTaskConfig) : {};
			} catch {
				taskConfig = {};
			}
		} finally {
			loadingDetail = false;
		}
	}

	$effect(() => {
		if (selectedOrgId) loadDetail(selectedOrgId);
	});

	// ── Actions ───────────────────────────────────────────────────────────────
	async function createOrg() {
		if (!createName.trim()) return;
		creating = true;
		createError = '';
		try {
			const org = await trpc.orgs.create.mutate({ name: createName.trim() });
			orgs = [...orgs, { id: org.id, name: org.name, slug: org.slug, role: 'owner' }];
			selectedOrgId = org.id;
			createName = '';
		} catch (e: unknown) {
			createError = e instanceof Error ? e.message : 'Error creating organization.';
		} finally {
			creating = false;
		}
	}

	async function sendInvite() {
		if (!inviteEmail || !selectedOrgId) return;
		inviting = true;
		inviteError = '';
		try {
			await trpc.orgs.invite.mutate({ orgId: selectedOrgId, email: inviteEmail, role: 'member' });
			inviteEmail = '';
			await loadDetail(selectedOrgId);
		} catch (e: unknown) {
			inviteError = e instanceof Error ? e.message : 'Error sending invitation.';
		} finally {
			inviting = false;
		}
	}

	async function cancelInvite(invitationId: string) {
		await trpc.orgs.cancelInvite.mutate(invitationId);
		if (selectedOrgId) await loadDetail(selectedOrgId);
	}

	async function removeMember(memberId: string) {
		await trpc.orgs.removeMember.mutate(memberId);
		if (selectedOrgId) await loadDetail(selectedOrgId);
	}

	async function addKey() {
		if (!newKeyName.trim() || !newKeyValue.trim() || !selectedOrgId) return;
		addingKey = true;
		keyError = '';
		try {
			await trpc.orgs.addKey.mutate({ orgId: selectedOrgId, name: newKeyName.trim(), apiKey: newKeyValue.trim() });
			newKeyName = '';
			newKeyValue = '';
			await loadDetail(selectedOrgId);
		} catch (e: unknown) {
			keyError = e instanceof Error ? e.message : 'Error adding key.';
		} finally {
			addingKey = false;
		}
	}

	async function toggleKey(keyId: string, enabled: boolean) {
		await trpc.orgs.toggleKey.mutate({ keyId, enabled });
		keys = keys.map((k) => (k.id === keyId ? { ...k, enabled } : k));
	}

	async function deleteKey(keyId: string) {
		await trpc.orgs.deleteKey.mutate(keyId);
		keys = keys.filter((k) => k.id !== keyId);
	}

	async function saveBudget() {
		if (!selectedOrgId) return;
		savingBudget = true;
		try {
			const val = budgetInput.trim() === '' ? null : budgetInput.trim();
			await trpc.orgs.update.mutate({ orgId: selectedOrgId, monthlyBudgetEur: val });
			if (orgData) orgData = { ...orgData, monthlyBudgetEur: val };
		} finally {
			savingBudget = false;
		}
	}

	async function setTask(task: string, keyId: string, model: string) {
		if (!selectedOrgId) return;
		await trpc.orgs.setTaskConfig.mutate({ orgId: selectedOrgId, task: task as 'agent' | 'draft' | 'review' | 'requirements', keyId, model });
		taskConfig = { ...taskConfig, [task]: { keyId, model } };
	}
</script>

<div class="flex gap-6">
	<!-- Sidebar: org list + create -->
	<aside class="w-48 shrink-0">
		<div class="space-y-1">
			{#each orgs as org (org.id)}
				<button
					type="button"
					onclick={() => (selectedOrgId = org.id)}
					class="w-full truncate rounded-lg px-3 py-2 text-left font-sans text-sm transition-colors {selectedOrgId === org.id ? 'bg-accent/10 text-accent' : 'text-ink-muted hover:bg-paper-ui hover:text-ink dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui dark:hover:text-dark-ink'}"
				>
					{org.name}
					{#if org.role === 'owner'}
						<span class="ml-1 font-sans text-[10px] opacity-60">owner</span>
					{/if}
				</button>
			{/each}
		</div>

		<!-- Create org -->
		<div class="mt-4 border-t border-paper-border pt-4 dark:border-dark-paper-border">
			<p class="mb-2 font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted">New organization</p>
			<input
				bind:value={createName}
				placeholder="Name"
				class="w-full rounded-md border border-paper-border bg-paper px-2.5 py-1.5 font-sans text-sm text-ink placeholder-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink dark:placeholder-dark-ink-faint"
				onkeydown={(e) => e.key === 'Enter' && createOrg()}
			/>
			{#if createError}
				<p class="mt-1 font-sans text-xs text-red-500">{createError}</p>
			{/if}
			<button
				type="button"
				onclick={createOrg}
				disabled={creating || !createName.trim()}
				class="mt-2 w-full rounded-md bg-accent px-3 py-1.5 font-sans text-xs font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-50"
			>
				{creating ? 'Creating…' : 'Create'}
			</button>
		</div>
	</aside>

	<!-- Main panel -->
	<div class="min-w-0 flex-1">
		{#if !selectedOrg}
			<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">Select or create an organization.</p>
		{:else if loadingDetail}
			<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">Loading…</p>
		{:else}
			<div class="space-y-8">
				<div>
					<h3 class="font-serif text-lg font-semibold text-ink dark:text-dark-ink">{selectedOrg.name}</h3>
					<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">/{selectedOrg.slug}</p>
				</div>

				<!-- Usage & budget -->
				<section>
					<h4 class="mb-3 font-sans text-xs font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-ink-muted">Usage & Budget</h4>
					<div class="rounded-lg border border-paper-border p-4 dark:border-dark-paper-border">
						<p class="font-sans text-sm text-ink dark:text-dark-ink">
							This month: <span class="font-semibold">€{parseFloat(monthlyUsage?.totalEur ?? '0').toFixed(4)}</span>
						</p>
						{#if isOwner}
							<div class="mt-3 flex items-center gap-2">
								<label class="font-sans text-xs text-ink-muted dark:text-dark-ink-muted">Monthly limit (€)</label>
								<input
									bind:value={budgetInput}
									type="number"
									min="0"
									step="1"
									placeholder="Unlimited"
									class="w-28 rounded-md border border-paper-border bg-paper px-2.5 py-1 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
								/>
								<button
									type="button"
									onclick={saveBudget}
									disabled={savingBudget}
									class="rounded-md bg-accent px-3 py-1 font-sans text-xs font-medium text-white hover:opacity-80 disabled:opacity-50"
								>
									{savingBudget ? 'Saving…' : 'Save'}
								</button>
							</div>
						{:else}
							<p class="mt-1 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
								Limit: {orgData?.monthlyBudgetEur ? `€${orgData.monthlyBudgetEur}` : 'Unlimited'}
							</p>
						{/if}
					</div>
				</section>

				<!-- API Keys (owner only) -->
				{#if isOwner}
					<section>
						<h4 class="mb-3 font-sans text-xs font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-ink-muted">API Keys</h4>
						<div class="space-y-2">
							{#each keys as key (key.id)}
								<div class="flex items-center justify-between rounded-lg border border-paper-border px-3 py-2 dark:border-dark-paper-border">
									<span class="font-sans text-sm text-ink dark:text-dark-ink">{key.name}</span>
									<div class="flex items-center gap-2">
										<button
											type="button"
											onclick={() => toggleKey(key.id, !key.enabled)}
											class="font-sans text-xs {key.enabled ? 'text-green-600' : 'text-ink-faint dark:text-dark-ink-faint'}"
										>
											{key.enabled ? 'Active' : 'Disabled'}
										</button>
										<button
											type="button"
											onclick={() => deleteKey(key.id)}
											class="font-sans text-xs text-red-500 hover:text-red-700"
										>
											Delete
										</button>
									</div>
								</div>
							{/each}
						</div>

						<div class="mt-3 flex gap-2">
							<input
								bind:value={newKeyName}
								placeholder="Key name"
								class="w-32 rounded-md border border-paper-border bg-paper px-2.5 py-1.5 font-sans text-sm text-ink placeholder-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink dark:placeholder-dark-ink-faint"
							/>
							<input
								bind:value={newKeyValue}
								placeholder="sk-or-…"
								type="password"
								class="flex-1 rounded-md border border-paper-border bg-paper px-2.5 py-1.5 font-sans text-sm text-ink placeholder-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink dark:placeholder-dark-ink-faint"
							/>
							<button
								type="button"
								onclick={addKey}
								disabled={addingKey || !newKeyName.trim() || !newKeyValue.trim()}
								class="rounded-md bg-accent px-3 py-1.5 font-sans text-xs font-medium text-white hover:opacity-80 disabled:opacity-50"
							>
								{addingKey ? 'Adding…' : 'Add'}
							</button>
						</div>
						{#if keyError}
							<p class="mt-1 font-sans text-xs text-red-500">{keyError}</p>
						{/if}
					</section>

					<!-- AI Task Config (owner only) -->
					<section>
						<h4 class="mb-3 font-sans text-xs font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-ink-muted">AI Task Configuration</h4>
						{#if keys.filter((k) => k.enabled).length === 0}
							<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">Add an API key first.</p>
						{:else}
							<div class="space-y-3">
								{#each AI_TASKS as task (task.id)}
									{@const current = taskConfig[task.id]}
									<div class="flex items-center gap-3">
										<span class="w-28 font-sans text-sm text-ink dark:text-dark-ink">{task.label}</span>
										<select
											value={current?.keyId ?? ''}
											onchange={(e) => {
												const keyId = (e.target as HTMLSelectElement).value;
												const model = current?.model ?? MODELS[0].id;
												if (keyId) setTask(task.id, keyId, model);
											}}
											class="rounded-md border border-paper-border bg-paper px-2 py-1 font-sans text-xs text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
										>
											<option value="">— key —</option>
											{#each keys.filter((k) => k.enabled) as key (key.id)}
												<option value={key.id}>{key.name}</option>
											{/each}
										</select>
										<select
											value={current?.model ?? ''}
											onchange={(e) => {
												const model = (e.target as HTMLSelectElement).value;
												const keyId = current?.keyId ?? keys.find((k) => k.enabled)?.id ?? '';
												if (keyId && model) setTask(task.id, keyId, model);
											}}
											class="flex-1 rounded-md border border-paper-border bg-paper px-2 py-1 font-sans text-xs text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
										>
											<option value="">— model —</option>
											{#each MODELS as model (model.id)}
												<option value={model.id}>{model.label}</option>
											{/each}
										</select>
									</div>
								{/each}
							</div>
						{/if}
					</section>
				{/if}

				<!-- Members -->
				<section>
					<h4 class="mb-3 font-sans text-xs font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-ink-muted">Members</h4>
					<div class="space-y-2">
						{#each members as member (member.id)}
							<div class="flex items-center justify-between rounded-lg border border-paper-border px-3 py-2 dark:border-dark-paper-border">
								<span class="font-mono text-xs text-ink-muted dark:text-dark-ink-muted">{member.userId.slice(0, 12)}…</span>
								<div class="flex items-center gap-3">
									<span class="font-sans text-xs capitalize text-ink-faint dark:text-dark-ink-faint">{member.role}</span>
									{#if isOwner}
										<button
											type="button"
											onclick={() => removeMember(member.id)}
											class="font-sans text-xs text-red-500 hover:text-red-700"
										>
											Remove
										</button>
									{/if}
								</div>
							</div>
						{/each}
						{#if members.length === 0}
							<p class="font-sans text-sm text-ink-faint dark:text-dark-ink-faint">No members yet.</p>
						{/if}
					</div>
				</section>

				<!-- Invite (owner only) -->
				{#if isOwner}
					<section>
						<h4 class="mb-3 font-sans text-xs font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-ink-muted">Invite member</h4>
						<div class="flex gap-2">
							<input
								bind:value={inviteEmail}
								type="email"
								placeholder="email@institution.edu"
								class="flex-1 rounded-md border border-paper-border bg-paper px-2.5 py-1.5 font-sans text-sm text-ink placeholder-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink dark:placeholder-dark-ink-faint"
								onkeydown={(e) => e.key === 'Enter' && sendInvite()}
							/>
							<button
								type="button"
								onclick={sendInvite}
								disabled={inviting || !inviteEmail}
								class="rounded-md bg-accent px-3 py-1.5 font-sans text-xs font-medium text-white hover:opacity-80 disabled:opacity-50"
							>
								{inviting ? 'Sending…' : 'Invite'}
							</button>
						</div>
						{#if inviteError}
							<p class="mt-1 font-sans text-xs text-red-500">{inviteError}</p>
						{/if}

						<!-- Pending invitations -->
						{#if invitations.filter((i) => i.status === 'pending').length > 0}
							<div class="mt-3 space-y-1">
								{#each invitations.filter((i) => i.status === 'pending') as inv (inv.id)}
									<div class="flex items-center justify-between rounded-lg bg-paper-ui px-3 py-2 dark:bg-dark-paper-ui">
										<span class="font-sans text-xs text-ink-muted dark:text-dark-ink-muted">{inv.invitedEmail}</span>
										<button
											type="button"
											onclick={() => cancelInvite(inv.id)}
											class="font-sans text-xs text-ink-faint hover:text-red-500 dark:text-dark-ink-faint"
										>
											Cancel
										</button>
									</div>
								{/each}
							</div>
						{/if}
					</section>
				{/if}
			</div>
		{/if}
	</div>
</div>
