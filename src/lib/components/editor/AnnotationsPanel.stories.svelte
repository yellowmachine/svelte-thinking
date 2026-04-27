<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import AnnotationsPanel from './AnnotationsPanel.svelte';

	const now = new Date('2025-04-20T10:00:00Z');

	const sampleRefs = [
		{ id: 'ref1', citeKey: 'dennett1991' },
		{ id: 'ref2', citeKey: 'chalmers1996' },
		{ id: 'ref3', citeKey: 'nagel1974' }
	];

	const sampleSubnotes = [
		{
			id: 1,
			referenceId: 'ref1',
			slug: 'p23',
			notes: 'Key argument about intentionality and qualia.',
			anchorText: 'the intentional stance dissolves the hard problem',
			createdAt: now,
			updatedAt: now
		},
		{
			id: 2,
			referenceId: 'ref1',
			slug: 'p87',
			notes: 'Dennett criticises Nagel directly here.',
			anchorText: null,
			createdAt: now,
			updatedAt: now
		},
		{
			id: 3,
			referenceId: 'ref1',
			slug: 'p142',
			notes: '',
			anchorText: 'the multiple drafts model implies',
			createdAt: now,
			updatedAt: now
		}
	];

	const { Story } = defineMeta({
		title: 'Editor/AnnotationsPanel',
		component: AnnotationsPanel,
		tags: ['autodocs']
	});
</script>

<Story
	name="NoReference"
	args={{
		subnotes: [],
		sourceReference: null,
		projectRefs: sampleRefs
	}}
/>

<Story
	name="NoReferenceWithPicker"
	args={{
		subnotes: [],
		sourceReference: null,
		projectRefs: sampleRefs
	}}
/>

<Story
	name="EmptySubnotes"
	args={{
		subnotes: [],
		sourceReference: { id: 'ref1', citeKey: 'dennett1991' },
		projectRefs: sampleRefs
	}}
/>

<Story
	name="WithSubnotes"
	args={{
		subnotes: sampleSubnotes,
		sourceReference: { id: 'ref1', citeKey: 'dennett1991' },
		projectRefs: sampleRefs
	}}
/>
