<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { fn } from 'storybook/test';
	import UrlLookupPanel from './UrlLookupPanel.svelte';

	const { Story } = defineMeta({
		title: 'Bib/UrlLookupPanel',
		component: UrlLookupPanel,
		tags: ['autodocs'],
		args: {
			projectId: 'project-1',
			onclose: fn(),
			onaccept: fn()
		}
	});
</script>

<Story name="With AI key" args={{ hasAiKey: true }} />

<Story name="No AI key" args={{ hasAiKey: false }} />
