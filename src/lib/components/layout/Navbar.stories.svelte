<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Navbar from './Navbar.svelte';

	const { Story } = defineMeta({
		title: 'Layout/Navbar',
		component: Navbar,
		tags: ['autodocs'],
		parameters: {
			layout: 'fullscreen'
		}
	});
</script>

<Story
	name="Default"
	args={{
		user: { name: 'Miguel Fernández', email: 'miguel@universidad.edu' }
	}}
/>

<Story
	name="Long name"
	args={{
		user: { name: 'María Alejandra Rodríguez Castellanos', email: 'mrodriguez@institutoavanzado.edu.mx' }
	}}
/>

<Story
	name="Short name"
	args={{
		user: { name: 'Li Wu', email: 'li@mit.edu' }
	}}
/>
