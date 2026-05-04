<script lang="ts">
	import type { PageData } from './$types';

	let { data } = $props();

	const pending = $derived(data.entries.filter((e) => e.status === 'pending'));
	const approved = $derived(data.entries.filter((e) => e.status === 'approved'));
	const rejected = $derived(data.entries.filter((e) => e.status === 'rejected'));

	function formatDate(d: Date) {
		return new Date(d).toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<div class="mx-auto max-w-3xl px-6 py-10">
	<h1 class="mb-2 font-serif text-3xl font-semibold text-ink dark:text-dark-ink">Waitlist</h1>
	<p class="mb-8 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
		{pending.length} pending · {approved.length} approved · {rejected.length} rejected
	</p>

	{#if pending.length === 0}
		<div
			class="rounded-xl border border-dashed border-paper-border py-10 text-center dark:border-dark-paper-border"
		>
			<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">No pending requests.</p>
		</div>
	{:else}
		<div class="flex flex-col gap-3">
			{#each pending as entry (entry.id)}
				<div
					class="rounded-xl border border-paper-border bg-paper p-5 dark:border-dark-paper-border dark:bg-dark-paper"
				>
					<div class="flex items-start justify-between gap-4">
						<div class="min-w-0">
							<p class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">
								{entry.name ?? '—'}
							</p>
							<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">{entry.email}</p>
							{#if entry.message}
								<p class="mt-2 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
									"{entry.message}"
								</p>
							{/if}
							<p class="mt-1 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
								{formatDate(entry.createdAt)}
							</p>
						</div>
						<div class="flex shrink-0 gap-2">
							<form method="POST" action="?/reject">
								<input type="hidden" name="id" value={entry.id} />
								<button
									type="submit"
									class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted"
								>
									Reject
								</button>
							</form>
						</div>
					</div>

					<!-- Approve form with optional personal note -->
					<form
						method="POST"
						action="?/approve"
						class="mt-4 border-t border-paper-border pt-4 dark:border-dark-paper-border"
					>
						<input type="hidden" name="id" value={entry.id} />
						<label
							for="personalNote-{entry.id}"
							class="mb-1.5 block font-sans text-xs text-ink-faint dark:text-dark-ink-faint"
						>
							✦ Personal note <span class="text-ink-faint/60 dark:text-dark-ink-faint/60"
								>(optional — will appear in the email as a little card)</span
							>
						</label>
						<textarea
							id="personalNote-{entry.id}"
							name="personalNote"
							rows="3"
							placeholder="Write something warm and personal for this person…"
							class="w-full resize-none rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-serif text-sm text-ink italic placeholder:text-ink-faint/50 placeholder:not-italic focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink dark:placeholder:text-dark-ink-faint/50"
						></textarea>
						<div class="mt-2 flex justify-end">
							<button
								type="submit"
								class="rounded-md bg-accent px-3 py-1.5 font-sans text-xs font-medium text-white transition-opacity hover:opacity-90"
							>
								Approve and send
							</button>
						</div>
					</form>
				</div>
			{/each}
		</div>
	{/if}

	{#if approved.length > 0}
		<h2 class="mt-10 mb-3 font-serif text-lg font-semibold text-ink dark:text-dark-ink">
			Approved
		</h2>
		<div class="flex flex-col gap-2">
			{#each approved as entry (entry.id)}
				<div
					class="flex items-center justify-between rounded-lg border border-paper-border bg-paper px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper"
				>
					<div>
						<span class="font-sans text-sm text-ink dark:text-dark-ink">{entry.name ?? '—'}</span>
						<span class="ml-2 font-sans text-sm text-ink-muted dark:text-dark-ink-muted"
							>{entry.email}</span
						>
					</div>
					<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint"
						>{formatDate(entry.createdAt)}</span
					>
				</div>
			{/each}
		</div>
	{/if}
</div>
