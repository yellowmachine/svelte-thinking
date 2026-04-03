<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import MobileHeader from './MobileHeader.svelte';

	const { Story } = defineMeta({
		title: 'Layout/MobileHeader',
		component: MobileHeader,
		tags: ['autodocs'],
		parameters: {
			layout: 'fullscreen',
			viewport: { defaultViewport: 'mobile1' }
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
