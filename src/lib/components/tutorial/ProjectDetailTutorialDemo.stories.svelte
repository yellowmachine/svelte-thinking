<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ProjectDetailTutorialDemo from './ProjectDetailTutorialDemo.svelte';

	const { Story } = defineMeta({
		title: 'Tutorial/Project detail',
		component: ProjectDetailTutorialDemo,
		tags: ['!autodocs', '!vitest'],
		parameters: {
			layout: 'fullscreen'
		}
	});
</script>

<Story name="Fresh user" args={{ completed: false }} />
<Story name="Already completed" args={{ completed: true }} />
