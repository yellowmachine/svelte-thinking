<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ErrorPage from './ErrorPage.svelte';

	const { Story } = defineMeta({
		title: 'UI/ErrorPage',
		component: ErrorPage,
		tags: ['autodocs'],
		parameters: {
			layout: 'fullscreen'
		},
		argTypes: {
			status: {
				control: 'select',
				options: [404, 403, 500]
			}
		}
	});
</script>

<Story name="Not Found" args={{ status: 404 }} />
<Story name="Forbidden" args={{ status: 403 }} />
<Story name="Server Error" args={{ status: 500 }} />
