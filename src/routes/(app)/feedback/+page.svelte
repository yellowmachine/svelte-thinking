<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function formatDate(date: Date) {
		return new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(new Date(date));
	}
</script>

<div class="mx-auto max-w-2xl px-6 py-10">
	<div class="mb-8">
		<h1 class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">Sugerencias de la comunidad</h1>
		<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			{data.entries.length} {data.entries.length === 1 ? 'sugerencia' : 'sugerencias'} de usuarios en beta.
		</p>
	</div>

	{#if data.entries.length === 0}
		<div class="rounded-2xl border border-dashed border-paper-border py-16 text-center dark:border-dark-paper-border">
			<p class="font-sans text-sm text-ink-faint dark:text-dark-ink-faint">Todavía no hay sugerencias. Sé el primero.</p>
		</div>
	{:else}
		<div class="flex flex-col gap-3">
			{#each data.entries as entry (entry.id)}
				<div class="rounded-xl border border-paper-border bg-paper px-5 py-4 dark:border-dark-paper-border dark:bg-dark-paper">
					<p class="font-sans text-sm leading-relaxed text-ink dark:text-dark-ink">{entry.message}</p>
					<p class="mt-2 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
						{entry.showName && entry.userName ? entry.userName : 'Usuario anónimo'}
						· {formatDate(entry.createdAt)}
					</p>
				</div>
			{/each}
		</div>
	{/if}
</div>
