<script lang="ts">
	let { data } = $props();

	function formatDate(d: Date) {
		return new Date(d).toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}
</script>

<div class="mx-auto max-w-3xl px-6 py-10">
	<div class="mb-8">
		<a
			href="/admin"
			class="font-sans text-sm text-ink-faint hover:text-ink dark:text-dark-ink-faint dark:hover:text-dark-ink"
			>← Admin</a
		>
		<h1 class="mt-2 font-serif text-3xl font-semibold text-ink dark:text-dark-ink">Users</h1>
	</div>

	<form method="GET" class="mb-6">
		<div class="flex gap-2">
			<input
				type="search"
				name="q"
				value={data.q}
				placeholder="Search by name or email…"
				class="flex-1 rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
			/>
			<button
				type="submit"
				class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90"
			>
				Search
			</button>
		</div>
	</form>

	{#if data.users.length === 0}
		<div
			class="rounded-xl border border-dashed border-paper-border py-10 text-center dark:border-dark-paper-border"
		>
			<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				{data.q ? 'No results for that search.' : 'No users registered.'}
			</p>
		</div>
	{:else}
		<div class="flex flex-col gap-3">
			{#each data.users as u (u.id)}
				<div
					class="rounded-xl border border-paper-border bg-paper p-5 dark:border-dark-paper-border dark:bg-dark-paper"
				>
					<div class="flex items-start justify-between gap-4">
						<div class="min-w-0">
							<p class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">{u.name}</p>
							<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">{u.email}</p>
							<div class="mt-2 flex items-center gap-2">
								<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint"
									>{formatDate(u.createdAt)}</span
								>
								{#if u.twoFactorEnabled}
									<span
										class="rounded-full bg-emerald-100 px-2 py-0.5 font-sans text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
									>
										2FA active
									</span>
								{/if}
							</div>
						</div>

						{#if u.twoFactorEnabled}
							<form
								method="POST"
								action="?/disable2FA"
								onsubmit={(e) => {
									if (!confirm(`Disable 2FA for ${u.email}? All their sessions will be closed.`))
										e.preventDefault();
								}}
								class="shrink-0"
							>
								<input type="hidden" name="userId" value={u.id} />
								<button
									type="submit"
									class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-xs text-ink-muted transition-colors hover:border-amber-300 hover:text-amber-700 dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:border-amber-700 dark:hover:text-amber-400"
								>
									Reset 2FA
								</button>
							</form>
						{/if}
					</div>
				</div>
			{/each}
		</div>

		{#if data.users.length === 50}
			<p class="mt-4 text-center font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
				Showing the 50 most recent. Use search to narrow results.
			</p>
		{/if}
	{/if}
</div>
