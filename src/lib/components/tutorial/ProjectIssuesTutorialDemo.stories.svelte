<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ProjectIssuesTutorialDemo from './ProjectIssuesTutorialDemo.svelte';

	const { Story } = defineMeta({
		title: 'Tutorial/Project issues',
		component: ProjectIssuesTutorialDemo,
		tags: ['!autodocs', '!vitest'],
		parameters: {
			layout: 'fullscreen'
		}
	});
</script>

<Story name="Fresh user" args={{ completed: false }} />
<Story name="Already completed" args={{ completed: true }} />
