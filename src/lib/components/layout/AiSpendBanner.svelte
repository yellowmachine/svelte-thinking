<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { AI_TASKS, formatModelSlug } from '$lib/ai-config';
	import { aiSpendStore } from '$lib/stores/aiSpend.svelte';

	/** The user's AI spending, in one line under the navbar (Settings → AI turns it on). */

	// "5 min ago" has to move on by itself between refreshes.
	let now = $state(Date.now());

	onMount(() => {
		const stop = aiSpendStore.watch();
		const tick = setInterval(() => (now = Date.now()), 60_000);
		return () => {
			stop();
			clearInterval(tick);
		};
	});

	const spend = $derived(aiSpendStore.spend);

	function usd(n: number | null): string {
		if (n === null) return '—';
		if (n === 0) return '$0.00';
		if (n < 0.01) return `$${n.toFixed(4)}`;
		return `$${n.toFixed(2)}`;
	}

	function ago(at: Date): string {
		const minutes = Math.round((now - new Date(at).getTime()) / 60_000);
		if (minutes < 1) return 'just now';
		if (minutes < 60) return `${minutes} min ago`;
		const hours = Math.round(minutes / 60);
		if (hours < 24) return `${hours} h ago`;
		const days = Math.round(hours / 24);
		return `${days} d ago`;
	}

	const taskLabel = (task: string | null) =>
		AI_TASKS.find((t) => t.id === task)?.label ?? task ?? 'AI';
</script>

<a
	href={resolve('/usage')}
	title="Your AI spending with your own OpenRouter key. Open the usage dashboard"
	class="flex shrink-0 items-center gap-x-3 overflow-hidden border-b border-paper-border bg-paper px-4 py-1.5 font-sans text-xs whitespace-nowrap text-ink-muted transition-colors hover:text-ink sm:px-6 dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink-muted dark:hover:text-dark-ink"
>
	<span class="font-medium text-ink dark:text-dark-ink">AI spend</span>
	{#if spend}
		<span>
			This month
			<span
				class="font-mono text-ink dark:text-dark-ink"
				title={spend.monthHasEstimates
					? 'Includes calls OpenRouter did not price, estimated from list prices'
					: undefined}>{spend.monthHasEstimates ? '≈ ' : ''}{usd(spend.monthUsd)}</span
			>
		</span>
		<span class="text-ink-faint dark:text-dark-ink-faint" aria-hidden="true">·</span>
		<span>
			This week <span class="font-mono text-ink dark:text-dark-ink">{usd(spend.weekUsd)}</span>
		</span>
		{#if spend.last}
			<span class="hidden text-ink-faint sm:inline dark:text-dark-ink-faint" aria-hidden="true"
				>·</span
			>
			<span class="hidden truncate sm:inline">
				Last: {taskLabel(spend.last.task)}
				<span class="text-ink-faint dark:text-dark-ink-faint"
					>({formatModelSlug(spend.last.model)})</span
				>
				<span class="font-mono text-ink dark:text-dark-ink"
					>{spend.last.costIsEstimate && spend.last.costUsd !== null ? '≈ ' : ''}{usd(
						spend.last.costUsd
					)}</span
				>
				· {ago(spend.last.at)}
			</span>
		{/if}
	{:else if aiSpendStore.failed}
		<span>Could not load your spending</span>
	{:else}
		<span class="text-ink-faint dark:text-dark-ink-faint">Loading…</span>
	{/if}
	<span class="ml-auto text-ink-faint dark:text-dark-ink-faint" aria-hidden="true">→</span>
</a>
