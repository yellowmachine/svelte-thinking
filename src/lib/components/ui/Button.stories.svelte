<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { fn } from 'storybook/test';
	import Plus from '@lucide/svelte/icons/plus';
	import Button from './Button.svelte';

	const { Story } = defineMeta({
		title: 'UI/Button',
		component: Button,
		tags: ['autodocs'],
		argTypes: {
			variant: { control: 'select', options: ['primary', 'secondary', 'ghost', 'danger'] },
			size: { control: 'select', options: ['sm', 'md', 'lg'] }
		},
		args: { onclick: fn() }
	});
</script>

<Story name="Primary" args={{ variant: 'primary' }}>Save changes</Story>
<Story name="Secondary" args={{ variant: 'secondary' }}>Cancel</Story>
<Story name="Ghost" args={{ variant: 'ghost' }}>Show more</Story>
<Story name="Danger" args={{ variant: 'danger' }}>Delete project</Story>
<Story name="With icon" args={{ variant: 'primary', icon: Plus }}>New document</Story>
<Story name="Small" args={{ variant: 'primary', size: 'sm' }}>Save</Story>
<Story name="Loading" args={{ variant: 'primary', loading: true }}>Saving</Story>
<Story name="Disabled" args={{ variant: 'primary', disabled: true }}>Save</Story>
