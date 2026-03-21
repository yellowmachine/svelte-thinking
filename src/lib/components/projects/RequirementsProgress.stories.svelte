<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import RequirementsProgress from './RequirementsProgress.svelte';

	const { Story } = defineMeta({
		title: 'Projects/RequirementsProgress',
		component: RequirementsProgress,
		tags: ['autodocs'],
		argTypes: {
			fulfilled: { control: { type: 'number', min: 0 } },
			total: { control: { type: 'number', min: 0 } },
			requiredFulfilled: { control: { type: 'number', min: 0 } },
			requiredTotal: { control: { type: 'number', min: 0 } }
		}
	});
</script>

<!-- Sin requisitos generados todavía — no muestra nada -->
<Story name="Empty (no requirements)" args={{ fulfilled: 0, total: 0, requiredFulfilled: 0, requiredTotal: 0 }} />

<!-- En progreso: faltan requisitos obligatorios -->
<Story name="Pending" args={{ fulfilled: 1, total: 5, requiredFulfilled: 1, requiredTotal: 4 }} />

<!-- Todos los obligatorios completos, pero hay opcionales pendientes -->
<Story name="Required done" args={{ fulfilled: 4, total: 6, requiredFulfilled: 4, requiredTotal: 4 }} />

<!-- Todo completo -->
<Story name="Complete" args={{ fulfilled: 5, total: 5, requiredFulfilled: 4, requiredTotal: 4 }} />

<!-- Dentro del botón, como aparece en la página del proyecto -->
<Story name="In context (button)" args={{ fulfilled: 2, total: 5, requiredFulfilled: 2, requiredTotal: 4 }}>
	{#snippet children(args)}
		<a
			href="#"
			class="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 font-sans text-sm text-gray-500 hover:bg-gray-50"
		>
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path d="M9 11l3 3L22 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
				<path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
			Requisitos
			<RequirementsProgress {...args} />
		</a>
	{/snippet}
</Story>

<Story name="In context (complete)" args={{ fulfilled: 5, total: 5, requiredFulfilled: 4, requiredTotal: 4 }}>
	{#snippet children(args)}
		<a
			href="#"
			class="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 font-sans text-sm text-gray-500 hover:bg-gray-50"
		>
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path d="M9 11l3 3L22 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
				<path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
			Requisitos
			<RequirementsProgress {...args} />
		</a>
	{/snippet}
</Story>
