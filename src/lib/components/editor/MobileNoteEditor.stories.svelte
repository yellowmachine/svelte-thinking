<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { fn } from 'storybook/test';
	import MobileNoteEditor from './MobileNoteEditor.svelte';

	const SAMPLE_CONTENT = `# Introducción

Este trabajo examina el impacto de las redes sociales en la comunicación académica.

## Metodología

Se emplearon tres métodos complementarios:

1. Análisis cuantitativo de publicaciones (2015–2024)
2. Entrevistas semiestructuradas con 42 investigadores
3. Revisión sistemática de la literatura`;

	const { Story } = defineMeta({
		title: 'Editor/MobileNoteEditor',
		component: MobileNoteEditor,
		tags: ['autodocs'],
		parameters: {
			viewport: { defaultViewport: 'mobile1' },
			layout: 'fullscreen'
		},
		args: {
			content: SAMPLE_CONTENT,
			projectTitle: 'Redes Neuronales',
			projectId: 'demo-project-id',
			documentTitle: 'Nota de introducción',
			onchange: fn(),
			onsave: fn()
		}
	});
</script>

<Story
	name="Sin guardar (pending)"
	args={{
		saveStatus: 'pending',
		isDirty: true
	}}
/>

<Story
	name="Guardado"
	args={{
		saveStatus: 'saved',
		isDirty: false
	}}
/>

<Story
	name="Guardando"
	args={{
		saveStatus: 'saving',
		isDirty: true
	}}
/>

<Story
	name="Error al guardar"
	args={{
		saveStatus: 'error',
		isDirty: true
	}}
/>

<Story
	name="Sin cambios (botón deshabilitado)"
	args={{
		saveStatus: 'idle',
		isDirty: false
	}}
/>
