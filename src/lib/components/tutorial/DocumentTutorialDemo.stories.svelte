<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import DocumentTutorialDemo from './DocumentTutorialDemo.svelte';

	const { Story } = defineMeta({
		title: 'Tutorial/Document editor',
		component: DocumentTutorialDemo,
		tags: ['!autodocs', '!vitest'],
		parameters: {
			layout: 'fullscreen'
		}
	});
</script>

<Story name="Fresh user" args={{ completed: false }} />
<Story name="Already completed" args={{ completed: true }} />
