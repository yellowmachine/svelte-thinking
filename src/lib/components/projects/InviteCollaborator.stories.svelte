<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import InviteCollaborator from './InviteCollaborator.svelte';

	const { Story } = defineMeta({
		title: 'Projects/InviteCollaborator',
		component: InviteCollaborator,
		tags: ['autodocs']
	});
</script>

<Story
	name="Empty"
	args={{
		projectId: 'project-123',
		invitations: []
	}}
/>

<Story
	name="With pending invitations"
	args={{
		projectId: 'project-123',
		invitations: [
			{
				id: '1',
				invitedEmail: 'maria@universidad.edu',
				role: 'reviewer',
				status: 'pending',
				expiresAt: new Date(Date.now() + 86400000 * 5)
			},
			{
				id: '2',
				invitedEmail: 'carlos@investigacion.org',
				role: 'coauthor',
				status: 'pending',
				expiresAt: new Date(Date.now() + 86400000 * 2)
			}
		]
	}}
/>
