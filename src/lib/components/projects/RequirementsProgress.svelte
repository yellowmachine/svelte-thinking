<script lang="ts">
	let {
		fulfilled,
		total,
		requiredFulfilled,
		requiredTotal
	}: {
		fulfilled: number;
		total: number;
		requiredFulfilled: number;
		requiredTotal: number;
	} = $props();

	type State = 'empty' | 'pending' | 'required-done' | 'complete';

	const state = $derived<State>(
		total === 0
			? 'empty'
			: fulfilled === total
				? 'complete'
				: requiredFulfilled === requiredTotal && requiredTotal > 0
					? 'required-done'
					: 'pending'
	);

	const label = $derived(
		state === 'empty'
			? null
			: state === 'complete'
				? `${total}/${total}`
				: `${requiredFulfilled}/${requiredTotal}`
	);

	const styles: Record<State, string> = {
		empty: '',
		pending:
			'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
		'required-done':
			'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
		complete:
			'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
	};
</script>

{#if state !== 'empty'}
	<span
		class="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-sans text-[10px] font-semibold tabular-nums {styles[state]}"
		title="{fulfilled} de {total} requisitos completados"
	>
		{#if state === 'complete' || state === 'required-done'}
			<svg width="8" height="8" viewBox="0 0 10 10" fill="none" aria-hidden="true">
				<path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
		{/if}
		{label}
	</span>
{/if}
