<script lang="ts">
	import { untrack } from 'svelte';
	import { trpc } from '$lib/utils/trpc';
	import { invalidateAll } from '$app/navigation';
	import { AI_TASKS, MODELS, MODEL_RECOMMENDATIONS } from '$lib/ai-config';
	import { type OrgInvitationStatus, isInvitationPending } from '$lib/domain/invitation';

	type Org = { id: string; name: string; slug: string; role: string };

	let { initialOrgs }: { initialOrgs: Org[] } = $props();

	// ── State ────────────────────────────────────────────────────────────────
	let orgs = $state<Org[]>(untrack(() => initialOrgs));
	let selectedOrgId = $state<string | null>(orgs[0]?.id ?? null);

	// Create org form
	let createName = $state('');
	let creating = $state(false);
	let createError = $state('');

	// Org detail state
	let members = $state<{ id: string; userId: string; role: string; createdAt: Date }[]>([]);
	let invitations = $state<
		{ id: string; invitedEmail: string; status: OrgInvitationStatus; expiresAt: Date }[]
	>([]);
	let keys = $state<{ id: string; name: string; enabled: boolean; createdAt: Date }[]>([]);
	let taskConfig = $state<Record<string, { keyId: string; model: string }>>({});
	let orgData = $state<{ ownerId: string } | null>(null);

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

	// S3 form (owner only)
	type OrgS3Config = {
		endpoint: string;
		bucket: string;
		region: string;
		publicUrl: string | null;
		verified: boolean;
	};
	let orgS3Config = $state<OrgS3Config | null>(null);
	let orgS3Endpoint = $state('');
	let orgS3Bucket = $state('');
	let orgS3Region = $state('us-east-1');
	let orgS3PublicUrl = $state('');
	let orgS3AccessKey = $state('');
	let orgS3SecretKey = $state('');
	let orgS3Saving = $state(false);
	let orgS3Testing = $state(false);
	let orgS3Error = $state('');
	let orgS3Success = $state('');

	// ── Derived ──────────────────────────────────────────────────────────────
	const selectedOrg = $derived(orgs.find((o) => o.id === selectedOrgId) ?? null);
	const isOwner = $derived(selectedOrg?.role === 'owner');

	// ── Load org detail ───────────────────────────────────────────────────────
	async function loadDetail(orgId: string) {
		loadingDetail = true;
		try {
			const [m, inv, k, org] = await Promise.all([
				trpc.orgs.listMembers.query(orgId),
				trpc.orgs.listInvitations.query(orgId),
				trpc.orgs.listKeys.query(orgId),
				trpc.orgs.get.query(orgId)
			]);
			members = m as typeof members;
			invitations = inv as typeof invitations;
			keys = k as typeof keys;
			orgData = { ownerId: org.ownerId };
			try {
				taskConfig = org.aiTaskConfig ? JSON.parse(org.aiTaskConfig) : {};
			} catch {
				taskConfig = {};
			}
			// Load org S3 config (owner only — silently skip on error)
			try {
				const s3 = (await trpc.s3Config.getOrg.query(orgId)) as OrgS3Config | null;
				orgS3Config = s3;
				if (s3) {
					orgS3Endpoint = s3.endpoint;
					orgS3Bucket = s3.bucket;
					orgS3Region = s3.region;
					orgS3PublicUrl = s3.publicUrl ?? '';
				} else {
					orgS3Endpoint = '';
					orgS3Bucket = '';
					orgS3Region = 'us-east-1';
					orgS3PublicUrl = '';
				}
			} catch {
				// Non-owner members get FORBIDDEN — ignore silently
				orgS3Config = null;
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
			await invalidateAll();
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
			await trpc.orgs.addKey.mutate({
				orgId: selectedOrgId,
				name: newKeyName.trim(),
				apiKey: newKeyValue.trim()
			});
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

	async function saveOrgS3() {
		if (!selectedOrgId) return;
		orgS3Saving = true;
		orgS3Error = '';
		orgS3Success = '';
		try {
			await trpc.s3Config.setOrg.mutate({
				orgId: selectedOrgId,
				config: {
					endpoint: orgS3Endpoint.trim(),
					bucket: orgS3Bucket.trim(),
					region: orgS3Region.trim() || 'us-east-1',
					publicUrl: orgS3PublicUrl.trim() || undefined,
					accessKey: orgS3AccessKey.trim(),
					secretKey: orgS3SecretKey.trim()
				}
			});
			orgS3AccessKey = '';
			orgS3SecretKey = '';
			orgS3Config = (await trpc.s3Config.getOrg.query(selectedOrgId)) as OrgS3Config | null;
			orgS3Success = 'Configuration saved. Test the connection to verify it.';
		} catch (e: unknown) {
			orgS3Error = e instanceof Error ? e.message : 'Error saving S3 config.';
		} finally {
			orgS3Saving = false;
		}
	}

	async function testOrgS3() {
		if (!selectedOrgId) return;
		orgS3Testing = true;
		orgS3Error = '';
		orgS3Success = '';
		try {
			const result = await trpc.s3Config.testOrg.mutate(selectedOrgId);
			if (result.ok) {
				orgS3Success = 'Connection verified successfully.';
				orgS3Config = (await trpc.s3Config.getOrg.query(selectedOrgId)) as OrgS3Config | null;
			} else {
				orgS3Error =
					(result as { error?: string }).error ??
					'Connection failed. Check credentials and bucket.';
			}
		} catch (e: unknown) {
			orgS3Error = e instanceof Error ? e.message : 'Error testing connection.';
		} finally {
			orgS3Testing = false;
		}
	}

	async function removeOrgS3() {
		if (!selectedOrgId) return;
		try {
			await trpc.s3Config.removeOrg.mutate(selectedOrgId);
			orgS3Config = null;
			orgS3Endpoint = '';
			orgS3Bucket = '';
			orgS3Region = 'us-east-1';
			orgS3PublicUrl = '';
		} catch (e: unknown) {
			orgS3Error = e instanceof Error ? e.message : 'Error removing S3 config.';
		}
	}

	async function setTask(task: string, keyId: string, model: string) {
		if (!selectedOrgId) return;
		await trpc.orgs.setTaskConfig.mutate({
			orgId: selectedOrgId,
			task: task as 'agent' | 'draft' | 'review' | 'requirements',
			keyId,
			model
		});
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
					class="w-full truncate rounded-lg px-3 py-2 text-left font-sans text-sm transition-colors {selectedOrgId ===
					org.id
						? 'bg-accent/10 text-accent'
						: 'text-ink-muted hover:bg-paper-ui hover:text-ink dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui dark:hover:text-dark-ink'}"
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
			<p class="mb-2 font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted">
				New organization
			</p>
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
				class="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-1.5 font-sans text-xs font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-50"
			>
				{#if !creating}
					<svg
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						aria-hidden="true"
					>
						<line x1="12" y1="5" x2="12" y2="19" />
						<line x1="5" y1="12" x2="19" y2="12" />
					</svg>
				{/if}
				{creating ? 'Creating…' : 'Create'}
			</button>
		</div>
	</aside>

	<!-- Main panel -->
	<div class="min-w-0 flex-1">
		{#if !selectedOrg}
			<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				Select or create an organization.
			</p>
		{:else if loadingDetail}
			<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">Loading…</p>
		{:else}
			<div class="space-y-8">
				<div>
					<h3 class="font-serif text-lg font-semibold text-ink dark:text-dark-ink">
						{selectedOrg.name}
					</h3>
					<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
						/{selectedOrg.slug}
					</p>
				</div>

				<!-- API Keys (owner only) -->
				{#if isOwner}
					<section>
						<h4
							class="mb-3 font-sans text-xs font-semibold tracking-wide text-ink-muted uppercase dark:text-dark-ink-muted"
						>
							API Keys
						</h4>
						<div class="space-y-2">
							{#each keys as key (key.id)}
								<div
									class="flex items-center justify-between rounded-lg border border-paper-border px-3 py-2 dark:border-dark-paper-border"
								>
									<span class="font-sans text-sm text-ink dark:text-dark-ink">{key.name}</span>
									<div class="flex items-center gap-2">
										<button
											type="button"
											onclick={() => toggleKey(key.id, !key.enabled)}
											class="font-sans text-xs {key.enabled
												? 'text-green-600'
												: 'text-ink-faint dark:text-dark-ink-faint'}"
										>
											{key.enabled ? 'Active' : 'Disabled'}
										</button>
										<button
											type="button"
											onclick={() => deleteKey(key.id)}
											class="inline-flex items-center gap-1 font-sans text-xs text-red-500 hover:text-red-700"
										>
											<svg
												width="11"
												height="11"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
												stroke-linejoin="round"
												aria-hidden="true"
											>
												<polyline points="3 6 5 6 21 6" />
												<path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
												<path d="M10 11v6M14 11v6" />
											</svg>
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
								class="flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 font-sans text-xs font-medium text-white hover:opacity-80 disabled:opacity-50"
							>
								{#if !addingKey}
									<svg
										width="11"
										height="11"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2.5"
										stroke-linecap="round"
										aria-hidden="true"
									>
										<line x1="12" y1="5" x2="12" y2="19" />
										<line x1="5" y1="12" x2="19" y2="12" />
									</svg>
								{/if}
								{addingKey ? 'Adding…' : 'Add'}
							</button>
						</div>
						{#if keyError}
							<p class="mt-1 font-sans text-xs text-red-500">{keyError}</p>
						{/if}
					</section>

					<!-- AI Task Config (owner only) -->
					<section>
						<h4
							class="mb-3 font-sans text-xs font-semibold tracking-wide text-ink-muted uppercase dark:text-dark-ink-muted"
						>
							AI Task Configuration
						</h4>
						{#if keys.filter((k) => k.enabled).length === 0}
							<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
								Add an API key first.
							</p>
						{:else}
							<div class="space-y-3">
								{#each AI_TASKS as task (task.id)}
									{@const current = taskConfig[task.id]}
									<div class="flex items-center gap-3">
										<span class="w-28 font-sans text-sm text-ink dark:text-dark-ink"
											>{task.label}</span
										>
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
												{@const isRec = MODEL_RECOMMENDATIONS[model.id]?.includes(task.id)}
												<option value={model.id}>{isRec ? '★ ' : ''}{model.label}</option>
											{/each}
										</select>
									</div>
								{/each}
							</div>
						{/if}
					</section>

					<!-- S3 Storage (owner only) -->
					<section>
						<h4
							class="mb-3 font-sans text-xs font-semibold tracking-wide text-ink-muted uppercase dark:text-dark-ink-muted"
						>
							S3 Storage
						</h4>

						{#if orgS3Config}
							<div
								class="mb-4 flex items-center justify-between gap-3 rounded-lg border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
							>
								<div class="min-w-0 flex-1">
									<p class="truncate font-sans text-sm font-medium text-ink dark:text-dark-ink">
										{orgS3Config.bucket}
										<span class="font-normal text-ink-faint dark:text-dark-ink-faint"
											>@ {orgS3Config.endpoint}</span
										>
									</p>
									<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
										{orgS3Config.verified ? 'Verified' : 'Unverified'} · Region: {orgS3Config.region}
									</p>
								</div>
								<div class="flex items-center gap-3">
									<span
										class="font-sans text-xs {orgS3Config.verified
											? 'text-green-600 dark:text-green-400'
											: 'text-amber-600 dark:text-amber-400'}"
									>
										{orgS3Config.verified ? '✓ OK' : '⚠ Unverified'}
									</span>
									<button
										type="button"
										onclick={testOrgS3}
										disabled={orgS3Testing}
										class="inline-flex items-center gap-1 font-sans text-xs text-accent hover:underline disabled:opacity-50"
									>
										{#if !orgS3Testing}
											<svg
												width="11"
												height="11"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
												stroke-linejoin="round"
												aria-hidden="true"
											>
												<polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
											</svg>
										{/if}
										{orgS3Testing ? 'Testing…' : 'Test'}
									</button>
									<button
										type="button"
										onclick={removeOrgS3}
										class="inline-flex items-center gap-1 font-sans text-xs text-red-500 hover:text-red-700"
									>
										<svg
											width="11"
											height="11"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
											aria-hidden="true"
										>
											<polyline points="3 6 5 6 21 6" />
											<path d="M19 6l-1 14H6L5 6" />
											<path d="M10 11v6M14 11v6" />
										</svg>
										Remove
									</button>
								</div>
							</div>
						{/if}

						{#if orgS3Error}
							<p
								class="mb-3 rounded-lg bg-red-50 px-3 py-2 font-sans text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400"
							>
								{orgS3Error}
							</p>
						{/if}
						{#if orgS3Success}
							<p
								class="mb-3 rounded-lg bg-green-50 px-3 py-2 font-sans text-sm text-green-700 dark:bg-green-950/30 dark:text-green-400"
							>
								{orgS3Success}
							</p>
						{/if}

						<p class="mb-3 font-sans text-sm font-medium text-ink dark:text-dark-ink">
							{orgS3Config ? 'Update configuration' : 'Configure bucket'}
						</p>
						<div class="grid grid-cols-2 gap-3">
							<div class="col-span-2">
								<label
									for="s3-endpoint"
									class="mb-1 block font-sans text-xs text-ink-muted dark:text-dark-ink-muted"
									>Endpoint URL</label
								>
								<input
									id="s3-endpoint"
									bind:value={orgS3Endpoint}
									type="url"
									placeholder="https://…"
									class="w-full rounded-md border border-paper-border bg-paper px-3 py-2 font-sans text-sm text-ink placeholder-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
								/>
							</div>
							<div>
								<label
									for="s3-bucket"
									class="mb-1 block font-sans text-xs text-ink-muted dark:text-dark-ink-muted"
									>Bucket</label
								>
								<input
									id="s3-bucket"
									bind:value={orgS3Bucket}
									placeholder="my-bucket"
									class="w-full rounded-md border border-paper-border bg-paper px-3 py-2 font-sans text-sm text-ink placeholder-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
								/>
							</div>
							<div>
								<label
									for="s3-region"
									class="mb-1 block font-sans text-xs text-ink-muted dark:text-dark-ink-muted"
									>Region</label
								>
								<input
									id="s3-region"
									bind:value={orgS3Region}
									placeholder="us-east-1"
									class="w-full rounded-md border border-paper-border bg-paper px-3 py-2 font-sans text-sm text-ink placeholder-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
								/>
							</div>
							<div class="col-span-2">
								<label
									for="s3-public-url"
									class="mb-1 block font-sans text-xs text-ink-muted dark:text-dark-ink-muted"
									>Public URL (optional)</label
								>
								<input
									id="s3-public-url"
									bind:value={orgS3PublicUrl}
									type="url"
									placeholder="https://cdn.example.com"
									class="w-full rounded-md border border-paper-border bg-paper px-3 py-2 font-sans text-sm text-ink placeholder-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
								/>
							</div>
							<div>
								<label
									for="s3-access-key"
									class="mb-1 block font-sans text-xs text-ink-muted dark:text-dark-ink-muted"
									>Access Key ID</label
								>
								<input
									id="s3-access-key"
									bind:value={orgS3AccessKey}
									autocomplete="off"
									class="w-full rounded-md border border-paper-border bg-paper px-3 py-2 font-mono text-sm text-ink placeholder-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
								/>
							</div>
							<div>
								<label
									for="s3-secret-key"
									class="mb-1 block font-sans text-xs text-ink-muted dark:text-dark-ink-muted"
									>Secret Access Key</label
								>
								<input
									id="s3-secret-key"
									bind:value={orgS3SecretKey}
									type="password"
									autocomplete="new-password"
									class="w-full rounded-md border border-paper-border bg-paper px-3 py-2 font-mono text-sm text-ink placeholder-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
								/>
							</div>
						</div>
						<button
							type="button"
							onclick={saveOrgS3}
							disabled={orgS3Saving ||
								!orgS3Endpoint.trim() ||
								!orgS3Bucket.trim() ||
								!orgS3AccessKey.trim() ||
								!orgS3SecretKey.trim()}
							class="mt-3 flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white hover:opacity-80 disabled:opacity-50"
						>
							{#if !orgS3Saving}
								<svg
									width="13"
									height="13"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
									<polyline points="17 21 17 13 7 13 7 21" />
									<polyline points="7 3 7 8 15 8" />
								</svg>
							{/if}
							{orgS3Saving ? 'Saving…' : 'Save'}
						</button>
					</section>
				{/if}

				<!-- Members -->
				<section>
					<h4
						class="mb-3 font-sans text-xs font-semibold tracking-wide text-ink-muted uppercase dark:text-dark-ink-muted"
					>
						Members
					</h4>
					<div class="space-y-2">
						{#each members as member (member.id)}
							<div
								class="flex items-center justify-between rounded-lg border border-paper-border px-3 py-2 dark:border-dark-paper-border"
							>
								<span class="font-mono text-xs text-ink-muted dark:text-dark-ink-muted"
									>{member.userId.slice(0, 12)}…</span
								>
								<div class="flex items-center gap-3">
									<span class="font-sans text-xs text-ink-faint capitalize dark:text-dark-ink-faint"
										>{member.role}</span
									>
									{#if isOwner}
										<button
											type="button"
											onclick={() => removeMember(member.id)}
											class="inline-flex items-center gap-1 font-sans text-xs text-red-500 hover:text-red-700"
										>
											<svg
												width="11"
												height="11"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
												stroke-linejoin="round"
												aria-hidden="true"
											>
												<path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
												<circle cx="8.5" cy="7" r="4" />
												<line x1="23" y1="11" x2="17" y2="11" />
											</svg>
											Remove
										</button>
									{/if}
								</div>
							</div>
						{/each}
						{#if members.length === 0}
							<p class="font-sans text-sm text-ink-faint dark:text-dark-ink-faint">
								No members yet.
							</p>
						{/if}
					</div>
				</section>

				<!-- Invite (owner only) -->
				{#if isOwner}
					<section>
						<h4
							class="mb-3 font-sans text-xs font-semibold tracking-wide text-ink-muted uppercase dark:text-dark-ink-muted"
						>
							Invite member
						</h4>
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
								class="flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 font-sans text-xs font-medium text-white hover:opacity-80 disabled:opacity-50"
							>
								{#if !inviting}
									<svg
										width="12"
										height="12"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										aria-hidden="true"
									>
										<path
											d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 8a16 16 0 006 6l.36-.36a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"
										/>
										<path d="M19 1v6M16 4h6" />
									</svg>
								{/if}
								{inviting ? 'Sending…' : 'Invite'}
							</button>
						</div>
						{#if inviteError}
							<p class="mt-1 font-sans text-xs text-red-500">{inviteError}</p>
						{/if}

						<!-- Pending invitations -->
						{#if invitations.filter((i) => isInvitationPending(i.status)).length > 0}
							<div class="mt-3 space-y-1">
								{#each invitations.filter((i) => isInvitationPending(i.status)) as inv (inv.id)}
									<div
										class="flex items-center justify-between rounded-lg bg-paper-ui px-3 py-2 dark:bg-dark-paper-ui"
									>
										<span class="font-sans text-xs text-ink-muted dark:text-dark-ink-muted"
											>{inv.invitedEmail}</span
										>
										<button
											type="button"
											onclick={() => cancelInvite(inv.id)}
											class="inline-flex items-center gap-1 font-sans text-xs text-ink-faint hover:text-red-500 dark:text-dark-ink-faint"
										>
											<svg
												width="11"
												height="11"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
												stroke-linejoin="round"
												aria-hidden="true"
											>
												<circle cx="12" cy="12" r="10" />
												<path d="M15 9l-6 6M9 9l6 6" />
											</svg>
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
