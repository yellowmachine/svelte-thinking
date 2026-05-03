<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Acknowledgements from './Acknowledgements.svelte';

	const { Story } = defineMeta({
		title: 'Landing/Acknowledgements',
		component: Acknowledgements,
		tags: ['autodocs']
	});
</script>

<Story
	name="Default"
	args={{
		people: [
			{
				name: 'César Rai',
				url: 'https://gravatar.com/cesarrai',
				description:
					'Thriller, dark fiction, science fiction, dark fantasy, horror, cozy fantasy...'
			}
		]
	}}
/>

<Story
	name="With Avatar"
	args={{
		people: [
			{
				name: 'César Rai',
				url: 'https://gravatar.com/cesarrai',
				description:
					'Thriller, dark fiction, science fiction, dark fantasy, horror, cozy fantasy...',
				avatarUrl: 'https://www.gravatar.com/avatar/ba5e4e2f8b5498e0d2b72c31e12fc8ee?s=128'
			}
		]
	}}
/>

<Story
	name="Multiple"
	args={{
		people: [
			{
				name: 'César Rai',
				url: 'https://gravatar.com/cesarrai',
				description:
					'Thriller, dark fiction, science fiction, dark fantasy, horror, cozy fantasy...'
			},
			{
				name: 'Jane Writer',
				url: 'https://example.com/jane',
				description: 'Literary fiction, historical novels, short stories.'
			},
			{
				name: 'Alex Storm',
				url: 'https://example.com/alex',
				description: 'Epic fantasy, urban fantasy, mythology-inspired fiction.'
			}
		]
	}}
/>
