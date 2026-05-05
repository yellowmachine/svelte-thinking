<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import SettingsTutorialDemo from './SettingsTutorialDemo.svelte';

	const { Story } = defineMeta({
		title: 'Tutorial/Settings',
		component: SettingsTutorialDemo,
		tags: ['!autodocs', '!vitest'],
		parameters: {
			layout: 'fullscreen'
		}
	});
</script>

<Story name="Fresh user" args={{ completed: false }} />
<Story name="Already completed" args={{ completed: true }} />
