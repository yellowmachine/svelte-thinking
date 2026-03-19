<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { fn } from 'storybook/test';
	import Button from './Button.svelte';

	const { Story } = defineMeta({
		title: 'UI/Button',
		component: Button,
		tags: ['autodocs'],
		argTypes: {
			variant: {
				control: 'select',
				options: ['primary', 'secondary', 'ghost', 'danger']
			},
			size: {
				control: 'select',
				options: ['sm', 'md', 'lg']
			}
		},
		args: {
			onclick: fn(),
			label: 'Botón'
		}
	});
</script>

<Story name="Primary" args={{ variant: 'primary', label: 'Guardar cambios' }} />

<Story name="Secondary" args={{ variant: 'secondary', label: 'Cancelar' }} />

<Story name="Ghost" args={{ variant: 'ghost', label: 'Ver más' }} />

<Story name="Danger" args={{ variant: 'danger', label: 'Eliminar proyecto' }} />

<Story name="Small" args={{ variant: 'primary', size: 'sm', label: 'Guardar' }} />

<Story name="Large" args={{ variant: 'primary', size: 'lg', label: 'Crear proyecto' }} />

<Story name="Disabled" args={{ variant: 'primary', label: 'Guardando...', disabled: true }} />
