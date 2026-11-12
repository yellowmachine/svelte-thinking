<script lang="ts">
	import {
		type ProjectRole,
		type ProjectStatus,
		PROJECT_ROLE_LABELS,
		PROJECT_STATUS_LABELS
	} from '$lib/domain/project';

	type Variant = ProjectRole | ProjectStatus;

	let { variant, label }: { variant: Variant; label?: string } = $props();

	const labels: Record<Variant, string> = { ...PROJECT_ROLE_LABELS, ...PROJECT_STATUS_LABELS };

	const styles: Record<Variant, string> = {
		owner: 'bg-accent text-white',
		author: 'bg-accent-light text-accent-ink',
		coauthor: 'bg-accent-light text-accent-ink',
		reviewer: 'bg-blue-100 text-blue-700',
		commenter: 'bg-paper-border text-ink-muted',
		draft: 'bg-paper-border text-ink-muted',
		active: 'bg-success-bg text-success',
		review: 'bg-warning-bg text-warning',
		published: 'bg-blue-100 text-blue-700',
		archived: 'bg-paper-border text-ink-faint'
	};

	let displayLabel = $derived(label ?? labels[variant]);
</script>

<span
	class="inline-flex items-center rounded-full px-2.5 py-0.5 font-sans text-xs font-medium {styles[
		variant
	]}"
>
	{displayLabel}
</span>
