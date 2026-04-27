<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import BibliographyPanel from './BibliographyPanel.svelte';

	/** @type {import('$lib/utils/citations').CiteRef[]} */
	const sampleRefs = [
		{
			id: '1',
			citeKey: 'dennett1991',
			type: 'book',
			title: 'Consciousness Explained',
			authors: [{ first: 'Daniel', last: 'Dennett' }],
			year: '1991',
			publisher: 'Little, Brown'
		},
		{
			id: '2',
			citeKey: 'chalmers1996',
			type: 'book',
			title: 'The Conscious Mind: In Search of a Fundamental Theory',
			authors: [{ first: 'David', last: 'Chalmers' }],
			year: '1996',
			publisher: 'Oxford University Press'
		},
		{
			id: '3',
			citeKey: 'nagel1974',
			type: 'article',
			title: 'What Is It Like to Be a Bat?',
			authors: [{ first: 'Thomas', last: 'Nagel' }],
			year: '1974',
			journal: 'The Philosophical Review',
			subnotes: [
				{
					slug: 'p1',
					notes: 'Argues that subjective experience is irreducible to physical facts.'
				},
				{ slug: 'p2', notes: 'Introduces the bat thought experiment.' }
			]
		},
		{
			id: '4',
			citeKey: 'searle1980',
			type: 'article',
			title: 'Minds, Brains, and Programs',
			authors: [{ first: 'John', last: 'Searle' }],
			year: '1980',
			journal: 'Behavioral and Brain Sciences'
		}
	];

	const { Story } = defineMeta({
		title: 'Editor/BibliographyPanel',
		component: BibliographyPanel,
		tags: ['autodocs']
	});
</script>

<Story
	name="Empty"
	args={{
		refs: [],
		filter: ''
	}}
/>

<Story
	name="NoFilter"
	args={{
		refs: sampleRefs,
		filter: ''
	}}
/>

<Story
	name="Filtered"
	args={{
		refs: sampleRefs,
		filter: 'chalmers'
	}}
/>

<Story
	name="NoMatches"
	args={{
		refs: sampleRefs,
		filter: 'xyz_not_found'
	}}
/>

<Story
	name="ActiveKey"
	args={{
		refs: sampleRefs,
		filter: '',
		activeKey: 'chalmers1996'
	}}
/>

<Story
	name="WithSubnotes"
	args={{
		refs: sampleRefs,
		filter: 'nagel',
		activeKey: 'nagel1974'
	}}
/>
