<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ExploreTutorialDemo from './ExploreTutorialDemo.svelte';

	const { Story } = defineMeta({
		title: 'Tutorial/Explore',
		component: ExploreTutorialDemo,
		tags: ['!autodocs', '!vitest'],
		parameters: {
			layout: 'fullscreen'
		}
	});
</script>

<Story name="Fresh user" args={{ completed: false }} />
<Story name="Already completed" args={{ completed: true }} />
