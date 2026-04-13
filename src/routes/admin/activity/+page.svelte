<script lang="ts">
	import type { PageData } from './$types';

	let { data } = $props();

	function formatDate(d: Date | null) {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('es-ES', {
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<div class="mx-auto max-w-3xl px-6 py-10">
	<div class="mb-8">
		<a href="/admin" class="font-sans text-sm text-ink-faint hover:text-ink dark:text-dark-ink-faint dark:hover:text-dark-ink">← Admin</a>
		<h1 class="mt-2 font-serif text-3xl font-semibold text-ink dark:text-dark-ink">Actividad reciente</h1>
		<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			{data.activeUsers.length} usuarios activos en los últimos {data.days} días
		</p>
	</div>

	{#if data.activeUsers.length === 0}
		<div class="rounded-xl border border-dashed border-paper-border py-10 text-center dark:border-dark-paper-border">
			<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">Sin actividad en los últimos {data.days} días.</p>
		</div>
	{:else}
		<div class="flex flex-col gap-2">
			{#each data.activeUsers as u (u.id)}
				<div class="flex items-center justify-between rounded-xl border border-paper-border bg-paper px-5 py-4 dark:border-dark-paper-border dark:bg-dark-paper">
					<div class="min-w-0">
						<p class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">{u.name}</p>
						<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">{u.email}</p>
					</div>
					<div class="flex shrink-0 items-center gap-6 text-right">
						<div>
							<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">Proyectos</p>
							<p class="font-sans text-sm font-medium text-ink dark:text-dark-ink">{u.projectCount}</p>
						</div>
						<div>
							<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">Último acceso</p>
							<p class="font-sans text-sm text-ink dark:text-dark-ink">{formatDate(u.lastSeen)}</p>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
