<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { fn } from 'storybook/test';
	import ImportBibPanel from './ImportBibPanel.svelte';

	const { Story } = defineMeta({
		title: 'Bib/ImportBibPanel',
		component: ImportBibPanel,
		tags: ['autodocs'],
		args: {
			projectId: 'project-1',
			onclose: fn(),
			onimported: fn()
		}
	});
</script>

<Story name="Empty" />
