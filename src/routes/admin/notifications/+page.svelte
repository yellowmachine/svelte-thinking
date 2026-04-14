<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const fmt = new Intl.DateTimeFormat('es', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});

	function isActive(n: { startsAt: Date; expiresAt: Date }) {
		const now = new Date();
		return n.startsAt <= now && n.expiresAt > now;
	}

	function isScheduled(n: { startsAt: Date }) {
		return n.startsAt > new Date();
	}

	// Default startsAt to now (local datetime-local format)
	const defaultStartsAt = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
		.toISOString()
		.slice(0, 16);
</script>

<svelte:head>
	<title>Notifications — Admin · Scholio</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-6 py-10">
	<div class="mb-8 flex items-center gap-3">
		<a
			href="/admin"
			class="font-sans text-sm text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
		>
			← Admin
		</a>
		<span class="text-ink-faint dark:text-dark-ink-faint">/</span>
		<h1 class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">Notifications</h1>
	</div>

	<!-- Create form -->
	<div class="mb-8 rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper">
		<h2 class="mb-4 font-sans text-sm font-semibold text-ink dark:text-dark-ink">New notification</h2>
		<form method="POST" action="?/create" use:enhance class="space-y-4">
			<div>
				<label for="message" class="mb-1 block font-sans text-xs text-ink-muted dark:text-dark-ink-muted">Message</label>
				<textarea
					id="message"
					name="message"
					rows="3"
					required
					placeholder="Write the notification message..."
					class="w-full resize-none rounded-lg border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink dark:placeholder:text-dark-ink-faint"
				></textarea>
			</div>
			<div class="flex gap-4">
				<div class="flex-1">
					<label for="startsAt" class="mb-1 block font-sans text-xs text-ink-muted dark:text-dark-ink-muted">Starts at</label>
					<input
						type="datetime-local"
						id="startsAt"
						name="startsAt"
						value={defaultStartsAt}
						required
						class="w-full rounded-lg border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
					/>
				</div>
				<div class="w-36">
					<label for="ttlHours" class="mb-1 block font-sans text-xs text-ink-muted dark:text-dark-ink-muted">TTL (hours)</label>
					<input
						type="number"
						id="ttlHours"
						name="ttlHours"
						min="1"
						value="24"
						required
						class="w-full rounded-lg border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
					/>
				</div>
			</div>
			{#if form?.error}
				<p class="font-sans text-xs text-red-600 dark:text-red-400">{form.error}</p>
			{/if}
			<button
				type="submit"
				class="rounded-lg bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90"
			>
				Create notification
			</button>
		</form>
	</div>

	<!-- Notification list -->
	<h2 class="mb-3 font-sans text-sm font-semibold text-ink dark:text-dark-ink">
		All notifications ({data.notifications.length})
	</h2>

	{#if data.notifications.length === 0}
		<p class="font-sans text-sm text-ink-faint dark:text-dark-ink-faint">No notifications yet.</p>
	{:else}
		<ul class="space-y-3">
			{#each data.notifications as n (n.id)}
				{@const active = isActive(n)}
				{@const scheduled = isScheduled(n)}
				<li class="rounded-xl border border-paper-border bg-paper p-4 dark:border-dark-paper-border dark:bg-dark-paper">
					<div class="flex items-start gap-3">
						<div class="flex-1 min-w-0">
							<div class="mb-1 flex items-center gap-2">
								{#if active}
									<span class="rounded-full bg-green-100 px-2 py-0.5 font-sans text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">Active</span>
								{:else if scheduled}
									<span class="rounded-full bg-blue-100 px-2 py-0.5 font-sans text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Scheduled</span>
								{:else}
									<span class="rounded-full bg-paper-ui px-2 py-0.5 font-sans text-xs font-medium text-ink-faint dark:bg-dark-paper-ui dark:text-dark-ink-faint">Expired</span>
								{/if}
							</div>
							<p class="font-sans text-sm text-ink dark:text-dark-ink">{n.message}</p>
							<p class="mt-1.5 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
								{fmt.format(new Date(n.startsAt))} → {fmt.format(new Date(n.expiresAt))}
							</p>
						</div>
						<form method="POST" action="?/delete" use:enhance>
							<input type="hidden" name="id" value={n.id} />
							<button
								type="submit"
								onclick={(e) => { if (!confirm('Delete this notification?')) e.preventDefault(); }}
								class="rounded p-1 text-ink-faint transition-colors hover:bg-red-50 hover:text-red-600 dark:text-dark-ink-faint dark:hover:bg-red-900/20 dark:hover:text-red-400"
								aria-label="Delete notification"
							>
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
									<polyline points="3 6 5 6 21 6" />
									<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
									<path d="M10 11v6M14 11v6" />
									<path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
								</svg>
							</button>
						</form>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>
