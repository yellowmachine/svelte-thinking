<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { fn } from 'storybook/test';
	import DocumentItem from './DocumentItem.svelte';

	const { Story } = defineMeta({
		title: 'Documents/DocumentItem',
		component: DocumentItem,
		tags: ['autodocs'],
		argTypes: {
			type: {
				control: 'select',
				options: ['paper', 'notes', 'outline', 'bibliography', 'supplementary']
			}
		},
		args: { onclick: fn() }
	});
</script>

<Story name="Inactive" args={{ title: 'Introducción', type: 'paper', active: false }} />

<Story name="Active" args={{ title: 'Marco Teórico', type: 'paper', active: true }} />

<Story name="Notes" args={{ title: 'Notas de campo', type: 'notes', active: false }} />

<Story name="Outline" args={{ title: 'Esquema general', type: 'outline', active: false }} />

<Story
	name="Bibliography"
	args={{ title: 'Referencias bibliográficas', type: 'bibliography', active: false }}
/>

<Story
	name="Long title truncated"
	args={{
		title: 'Análisis de resultados cuantitativos y cualitativos del estudio longitudinal',
		type: 'paper',
		active: false
	}}
/>
