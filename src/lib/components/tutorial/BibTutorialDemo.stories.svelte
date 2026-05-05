<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import BibTutorialDemo from './BibTutorialDemo.svelte';

	const { Story } = defineMeta({
		title: 'Tutorial/Global bibliography',
		component: BibTutorialDemo,
		tags: ['!autodocs', '!vitest'],
		parameters: {
			layout: 'fullscreen'
		}
	});
</script>

<Story name="Fresh user" args={{ completed: false }} />
<Story name="Already completed" args={{ completed: true }} />
