<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Badge from './Badge.svelte';

	const { Story } = defineMeta({
		title: 'UI/Badge',
		component: Badge,
		tags: ['autodocs'],
		argTypes: {
			variant: {
				control: 'select',
				options: [
					'owner',
					'author',
					'coauthor',
					'reviewer',
					'commenter',
					'draft',
					'active',
					'review',
					'published',
					'archived'
				]
			}
		}
	});
</script>

<!-- Roles -->
<Story name="Owner" args={{ variant: 'owner' }} />
<Story name="Author" args={{ variant: 'author' }} />
<Story name="Coauthor" args={{ variant: 'coauthor' }} />
<Story name="Reviewer" args={{ variant: 'reviewer' }} />
<Story name="Commenter" args={{ variant: 'commenter' }} />

<!-- Estados de proyecto -->
<Story name="Draft" args={{ variant: 'draft' }} />
<Story name="Active" args={{ variant: 'active' }} />
<Story name="In Review" args={{ variant: 'review' }} />
<Story name="Published" args={{ variant: 'published' }} />
<Story name="Archived" args={{ variant: 'archived' }} />
