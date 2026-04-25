<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { fn } from 'storybook/test';
	import LinkLibraryPanel from './LinkLibraryPanel.svelte';

	const { Story } = defineMeta({
		title: 'Bib/LinkLibraryPanel',
		component: LinkLibraryPanel,
		tags: ['autodocs'],
		args: {
			projectId: 'project-1',
			onclose: fn(),
			onlinked: fn()
		}
	});
</script>

<Story name="No linked refs" args={{ linkedRefs: [] }} />

<Story
	name="With linked refs"
	args={{
		linkedRefs: [
			{
				id: 'ref-1',
				citeKey: 'smith2024',
				title: 'An Introduction to Academic Writing',
				authors: [{ first: 'John', last: 'Smith' }],
				year: '2024'
			},
			{
				id: 'ref-2',
				citeKey: 'garcia2023',
				title: 'Methodology in Social Sciences',
				authors: [{ first: 'Ana', last: 'García' }],
				year: '2023'
			}
		]
	}}
/>
