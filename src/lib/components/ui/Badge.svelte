<script lang="ts">
	type RoleVariant = 'owner' | 'author' | 'coauthor' | 'reviewer' | 'commenter';
	type StatusVariant = 'draft' | 'active' | 'review' | 'published' | 'archived';
	type Variant = RoleVariant | StatusVariant;

	let { variant, label }: { variant: Variant; label?: string } = $props();

	const labels: Record<Variant, string> = {
		owner: 'Owner',
		author: 'Autor',
		coauthor: 'Coautor',
		reviewer: 'Revisor',
		commenter: 'Comentarista',
		draft: 'Borrador',
		active: 'Activo',
		review: 'En revisión',
		published: 'Publicado',
		archived: 'Archivado'
	};

	const styles: Record<Variant, string> = {
		owner: 'bg-accent text-white',
		author: 'bg-accent-light text-accent',
		coauthor: 'bg-accent-light text-accent',
		reviewer: 'bg-blue-100 text-blue-700',
		commenter: 'bg-paper-border text-ink-muted dark:bg-dark-paper-border dark:text-dark-ink-muted',
		draft: 'bg-paper-border text-ink-muted dark:bg-dark-paper-border dark:text-dark-ink-muted',
		active: 'bg-green-100 text-green-700',
		review: 'bg-amber-100 text-amber-700',
		published: 'bg-blue-100 text-blue-700',
		archived: 'bg-paper-border text-ink-faint dark:bg-dark-paper-border dark:text-dark-ink-faint'
	};

	let displayLabel = $derived(label ?? labels[variant]);
</script>

<span
	class="inline-flex items-center rounded-full px-2.5 py-0.5 font-sans text-xs font-medium {styles[variant]}"
>
	{displayLabel}
</span>
