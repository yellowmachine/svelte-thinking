<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { fn } from 'storybook/test';
	import ProjectCard from './ProjectCard.svelte';

	const { Story } = defineMeta({
		title: 'Projects/ProjectCard',
		component: ProjectCard,
		tags: ['autodocs'],
		argTypes: {
			status: {
				control: 'select',
				options: ['draft', 'active', 'review', 'published', 'archived']
			}
		},
		args: { onclick: fn() }
	});
</script>

<Story
	name="Draft"
	args={{
		title: 'Diversidad Epistémica y Producción Científica',
		description:
			'Estudio sobre cómo la heterogeneidad disciplinar en equipos de investigación afecta la calidad y el impacto de las publicaciones científicas.',
		status: 'draft',
		collaboratorCount: 1,
		updatedAt: new Date()
	}}
/>

<Story
	name="Active with collaborators"
	args={{
		title: 'Redes Neuronales en Diagnóstico Médico',
		description:
			'Revisión sistemática de la literatura sobre aplicaciones de deep learning en el diagnóstico de enfermedades oncológicas.',
		status: 'active',
		collaboratorCount: 4,
		updatedAt: new Date(Date.now() - 86400000 * 3)
	}}
/>

<Story
	name="In Review"
	args={{
		title: 'Cambio Climático y Biodiversidad Marina',
		status: 'review',
		collaboratorCount: 2,
		updatedAt: new Date(Date.now() - 86400000 * 10)
	}}
/>

<Story
	name="Published"
	args={{
		title: 'Algoritmos de Optimización Cuántica',
		description: 'Comparativa de rendimiento entre algoritmos clásicos y cuánticos en problemas NP.',
		status: 'published',
		collaboratorCount: 3,
		updatedAt: new Date(Date.now() - 86400000 * 30)
	}}
/>

<Story
	name="No description"
	args={{
		title: 'Borrador sin descripción',
		status: 'draft',
		collaboratorCount: 1
	}}
/>
