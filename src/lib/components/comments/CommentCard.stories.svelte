<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { fn } from 'storybook/test';
	import CommentCard from './CommentCard.svelte';

	const { Story } = defineMeta({
		title: 'Comments/CommentCard',
		component: CommentCard,
		tags: ['autodocs'],
		argTypes: {
			type: { control: 'select', options: ['general', 'inline'] },
			status: { control: 'select', options: ['open', 'resolved'] }
		},
		args: {
			onresolve: fn(),
			onreply: fn(),
			createdAt: new Date()
		}
	});
</script>

<Story
	name="General open"
	args={{
		authorName: 'María González',
		content:
			'La metodología descrita en esta sección no justifica suficientemente la selección de la muestra. Sería conveniente agregar una discusión sobre los criterios de inclusión y exclusión.',
		type: 'general',
		status: 'open'
	}}
/>

<Story
	name="General with replies"
	args={{
		authorName: 'Carlos Rodríguez',
		content: 'De acuerdo con el comentario anterior. Además, el tamaño muestral parece insuficiente.',
		type: 'general',
		status: 'open',
		replyCount: 3
	}}
/>

<Story
	name="Inline comment"
	args={{
		authorName: 'Ana Martínez',
		content: 'Esta afirmación necesita una cita. ¿Podría añadir la referencia correspondiente?',
		type: 'inline',
		status: 'open',
		anchorText:
			'los equipos interdisciplinares producen un 34% más de publicaciones de alto impacto'
	}}
/>

<Story
	name="Resolved"
	args={{
		authorName: 'Pedro Sánchez',
		content: 'El abstract supera el límite de 250 palabras establecido por la revista.',
		type: 'general',
		status: 'resolved'
	}}
/>

<Story
	name="Inline resolved"
	args={{
		authorName: 'Laura Torres',
		content: 'Correcto, esta frase es ambigua. Sugiero reformularla.',
		type: 'inline',
		status: 'resolved',
		anchorText: 'los resultados son significativos'
	}}
/>
