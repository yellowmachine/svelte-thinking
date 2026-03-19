<script lang="ts">
	type Status = 'draft' | 'active' | 'review' | 'published' | 'archived';

	let {
		title,
		description,
		status = 'draft',
		collaboratorCount = 1,
		updatedAt,
		onclick
	}: {
		title: string;
		description?: string;
		status?: Status;
		collaboratorCount?: number;
		updatedAt?: Date;
		onclick?: () => void;
	} = $props();

	const statusLabel: Record<Status, string> = {
		draft: 'Borrador',
		active: 'Activo',
		review: 'En revisión',
		published: 'Publicado',
		archived: 'Archivado'
	};

	const statusStyle: Record<Status, string> = {
		draft: 'bg-paper-border text-ink-muted dark:bg-dark-paper-border dark:text-dark-ink-muted',
		active: 'bg-green-100 text-green-700',
		review: 'bg-amber-100 text-amber-700',
		published: 'bg-blue-100 text-blue-700',
		archived: 'bg-paper-border text-ink-faint dark:bg-dark-paper-border dark:text-dark-ink-faint'
	};

	let formattedDate = $derived(
		updatedAt
			? new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' }).format(
					updatedAt
				)
			: null
	);
</script>

<button
	{onclick}
	class="group w-full rounded-xl border border-paper-border bg-paper p-5 text-left transition-all hover:border-accent/30 hover:shadow-sm dark:border-dark-paper-border dark:bg-dark-paper dark:hover:border-accent/30"
>
	<div class="flex items-start justify-between gap-3">
		<h3
			class="font-serif text-lg font-semibold text-ink group-hover:text-accent dark:text-dark-ink dark:group-hover:text-accent"
		>
			{title}
		</h3>
		<span
			class="shrink-0 rounded-full px-2.5 py-0.5 font-sans text-xs font-medium {statusStyle[status]}"
		>
			{statusLabel[status]}
		</span>
	</div>

	{#if description}
		<p
			class="mt-2 line-clamp-2 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted"
		>
			{description}
		</p>
	{/if}

	<div class="mt-4 flex items-center gap-4">
		<span
			class="flex items-center gap-1.5 font-sans text-xs text-ink-faint dark:text-dark-ink-faint"
		>
			<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
				<circle cx="6" cy="4" r="2" stroke="currentColor" stroke-width="1.2" />
				<path
					d="M2 10c0-2.21 1.79-4 4-4s4 1.79 4 4"
					stroke="currentColor"
					stroke-width="1.2"
					stroke-linecap="round"
				/>
			</svg>
			{collaboratorCount}
			{collaboratorCount === 1 ? 'colaborador' : 'colaboradores'}
		</span>

		{#if formattedDate}
			<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
				Actualizado {formattedDate}
			</span>
		{/if}
	</div>
</button>
