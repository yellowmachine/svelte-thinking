<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { fn } from 'storybook/test';
	import CommentThread from './CommentThread.svelte';

	const { Story } = defineMeta({
		title: 'Editor/CommentThread',
		component: CommentThread,
		tags: ['autodocs'],
		args: {
			currentUserId: 'user-1',
			onresolved: fn(),
			onreopened: fn(),
			onreplyadded: fn(),
			onclick: fn()
		},
		parameters: {
			layout: 'padded'
		}
	});

	const base = {
		id: 'c-1',
		authorName: 'Ana García',
		content: 'Esta sección necesita más referencias primarias, especialmente del período clásico.',
		anchorText: null,
		resolved: false,
		createdAt: new Date(Date.now() - 1000 * 60 * 35),
		replies: []
	};
</script>

<Story
	name="Simple"
	args={{
		comment: base
	}}
/>

<Story
	name="With anchor text"
	args={{
		comment: {
			...base,
			id: 'c-2',
			anchorText: 'La diversidad epistémica en equipos interdisciplinares ha sido ampliamente documentada'
		}
	}}
/>

<Story
	name="With replies"
	args={{
		comment: {
			...base,
			id: 'c-3',
			anchorText: 'los resultados sugieren una correlación positiva',
			replies: [
				{
					id: 'r-1',
					authorName: 'Carlos Ruiz',
					content: 'De acuerdo, podemos citar a Kuhn y Feyerabend aquí.',
					createdAt: new Date(Date.now() - 1000 * 60 * 20)
				},
				{
					id: 'r-2',
					authorName: 'Ana García',
					content: 'Perfecto, lo añado en la próxima revisión.',
					createdAt: new Date(Date.now() - 1000 * 60 * 10)
				}
			]
		}
	}}
/>

<Story
	name="Resolved"
	args={{
		comment: {
			...base,
			id: 'c-4',
			resolved: true,
			content: 'Añadir figura de metodología en la página 3.',
			replies: [
				{
					id: 'r-3',
					authorName: 'Carlos Ruiz',
					content: 'Figura añadida en la sección 2.1.',
					createdAt: new Date(Date.now() - 1000 * 60 * 5)
				}
			]
		}
	}}
/>
