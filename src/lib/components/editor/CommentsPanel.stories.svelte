<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import CommentsPanel from './CommentsPanel.svelte';

	const now = new Date('2025-04-20T10:00:00Z');

	const sampleComments = [
		{
			id: 'c1',
			authorId: 'u1',
			authorName: 'Ana García',
			content: 'This paragraph needs a citation for the main claim.',
			anchorText: 'the main claim is supported by recent studies',
			lineStart: 10,
			characterStart: 5,
			characterEnd: 50,
			paragraphNumber: 2,
			status: 'open',
			createdAt: now,
			replies: []
		},
		{
			id: 'c2',
			authorId: 'u2',
			authorName: 'Carlos López',
			content: 'Fixed — added Dennett 1991 reference.',
			anchorText: null,
			lineStart: null,
			characterStart: null,
			characterEnd: null,
			paragraphNumber: null,
			status: 'resolved',
			createdAt: new Date('2025-04-21T09:00:00Z'),
			replies: [
				{
					id: 'r1',
					content: 'Great, thanks!',
					authorName: 'Ana García',
					createdAt: new Date('2025-04-21T10:30:00Z')
				}
			]
		},
		{
			id: 'c3',
			authorId: 'u1',
			authorName: 'Ana García',
			content: 'The conclusion is too abrupt. Consider adding a summary sentence.',
			anchorText: 'In conclusion, the evidence suggests',
			lineStart: 45,
			characterStart: 0,
			characterEnd: 38,
			paragraphNumber: 8,
			status: 'open',
			createdAt: new Date('2025-04-22T14:00:00Z'),
			replies: []
		}
	];

	const { Story } = defineMeta({
		title: 'Editor/CommentsPanel',
		component: CommentsPanel,
		tags: ['autodocs']
	});
</script>

<Story
	name="Empty"
	args={{
		comments: [],
		currentUserId: 'u1',
		activeCommentId: null
	}}
/>

<Story
	name="WithComments"
	args={{
		comments: sampleComments,
		currentUserId: 'u1',
		activeCommentId: null
	}}
/>

<Story
	name="ActiveComment"
	args={{
		comments: sampleComments,
		currentUserId: 'u1',
		activeCommentId: 'c1'
	}}
/>

<Story
	name="CurrentUserIsAuthor"
	args={{
		comments: sampleComments,
		currentUserId: 'u2',
		activeCommentId: null
	}}
/>
