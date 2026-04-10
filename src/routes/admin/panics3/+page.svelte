<script lang="ts">
	import type { PageData } from './$types';

	let { data } = $props();

	function formatBytes(b: number): string {
		if (b < 1024) return `${b} B`;
		if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
		return `${(b / (1024 * 1024)).toFixed(1)} MB`;
	}

	function pct(used: number, quota: number): number {
		return Math.min(100, (used / quota) * 100);
	}
</script>

<div class="mx-auto max-w-3xl px-6 py-10">
	<h1 class="mb-1 font-serif text-3xl font-semibold text-ink dark:text-dark-ink">Internal S3</h1>
	<p class="mb-8 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
		{data.users.length} users with Scholio storage enabled ·
		{formatBytes(data.totalUsedBytes)} total used
	</p>

	<!-- Panic button -->
	{#if data.users.length > 0}
		<form
			method="POST"
			action="?/disableAll"
			onsubmit={(e) => {
				if (!confirm(`Disable internal storage for all ${data.users.length} users?`)) e.preventDefault();
			}}
			class="mb-8"
		>
			<button
				type="submit"
				class="rounded-lg bg-red-600 px-4 py-2.5 font-sans text-sm font-semibold text-white transition-opacity hover:opacity-90"
			>
				Disable all ({data.users.length})
			</button>
		</form>
	{/if}

	<!-- User list -->
	{#if data.users.length === 0}
		<div
			class="rounded-xl border border-dashed border-paper-border py-10 text-center dark:border-dark-paper-border"
		>
			<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				No users with internal storage enabled.
			</p>
		</div>
	{:else}
		<div class="flex flex-col gap-3">
			{#each data.users as u (u.userId)}
				{@const p = pct(u.usedBytes ?? 0, data.quotaBytes)}
				<div
					class="rounded-xl border border-paper-border bg-paper p-5 dark:border-dark-paper-border dark:bg-dark-paper"
				>
					<div class="flex items-start justify-between gap-4">
						<div class="min-w-0 flex-1">
							<p class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">
								{u.name ?? '—'}
							</p>
							<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">{u.email}</p>
							<div class="mt-3">
								<div
									class="mb-1 flex justify-between font-sans text-xs text-ink-faint dark:text-dark-ink-faint"
								>
									<span>{formatBytes(u.usedBytes ?? 0)}</span>
									<span>{formatBytes(data.quotaBytes)}</span>
								</div>
								<div
									class="h-1.5 w-full overflow-hidden rounded-full bg-paper-ui dark:bg-dark-paper-ui"
								>
									<div
										class="h-1.5 rounded-full {p >= 90
											? 'bg-red-500'
											: p >= 70
												? 'bg-amber-500'
												: 'bg-accent'}"
										style="width: {p}%"
									></div>
								</div>
							</div>
						</div>
						<form method="POST" action="?/disableUser" class="shrink-0">
							<input type="hidden" name="userId" value={u.userId} />
							<button
								type="submit"
								class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-xs text-ink-muted transition-colors hover:border-red-300 hover:text-red-600 dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:border-red-800 dark:hover:text-red-400"
							>
								Disable
							</button>
						</form>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
