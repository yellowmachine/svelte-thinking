<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { fn } from 'storybook/test';
	import DoiLookupPanel from './DoiLookupPanel.svelte';

	const { Story } = defineMeta({
		title: 'Bib/DoiLookupPanel',
		component: DoiLookupPanel,
		tags: ['autodocs'],
		args: {
			onclose: fn(),
			onaccept: fn()
		}
	});
</script>

<Story name="Empty" />
