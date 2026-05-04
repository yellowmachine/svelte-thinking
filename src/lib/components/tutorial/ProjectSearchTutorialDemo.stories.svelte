<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ProjectSearchTutorialDemo from './ProjectSearchTutorialDemo.svelte';

	const { Story } = defineMeta({
		title: 'Tutorial/Project search',
		component: ProjectSearchTutorialDemo,
		tags: ['!autodocs', '!vitest'],
		parameters: {
			layout: 'fullscreen'
		}
	});
</script>

<Story name="Fresh user" args={{ completed: false }} />
<Story name="Already completed" args={{ completed: true }} />
