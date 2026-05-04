<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import NetworkTutorialDemo from './NetworkTutorialDemo.svelte';

	const { Story } = defineMeta({
		title: 'Tutorial/Network',
		component: NetworkTutorialDemo,
		tags: ['!autodocs', '!vitest'],
		parameters: {
			layout: 'fullscreen'
		}
	});
</script>

<Story name="Fresh user" args={{ completed: false }} />
<Story name="Already completed" args={{ completed: true }} />
