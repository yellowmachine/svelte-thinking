<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import MobileNav from './MobileNav.svelte';

	const { Story } = defineMeta({
		title: 'Layout/MobileNav',
		component: MobileNav,
		tags: ['autodocs'],
		parameters: {
			layout: 'fullscreen',
			viewport: { defaultViewport: 'mobile1' }
		}
	});
</script>

<!-- Tab Proyectos activo -->
<Story
	name="Projects active"
	parameters={{
		sveltekit_experimental: {
			stores: {
				page: { url: new URL('http://localhost/projects') }
			}
		}
	}}
/>

<!-- Sin tab activo (home, bib, etc.) -->
<Story
	name="No active tab"
	parameters={{
		sveltekit_experimental: {
			stores: {
				page: { url: new URL('http://localhost/') }
			}
		}
	}}
/>
