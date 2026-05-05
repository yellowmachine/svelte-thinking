<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ProjectsTutorialDemo from './ProjectsTutorialDemo.svelte';

	const { Story } = defineMeta({
		title: 'Tutorial/TutorialManager',
		component: ProjectsTutorialDemo,
		tags: ['!autodocs', '!vitest'],
		parameters: {
			layout: 'fullscreen'
		}
	});
</script>

<!-- ── /projects ─────────────────────────────────────────────────────── -->

<Story name="Projects – Fresh user" args={{ completed: false }} />
<Story name="Projects – Already completed" args={{ completed: true }} />
