<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import MarkdownEditor from './MarkdownEditor.svelte';

	const { Story } = defineMeta({
		title: 'Editor/MarkdownEditor',
		component: MarkdownEditor,
		tags: ['autodocs']
	});
</script>

<Story
	name="Empty"
	args={{
		value: ''
	}}
/>

<Story
	name="With content"
	args={{
		value: `# Introducción\n\nEste trabajo examina el impacto de las redes sociales en la comunicación académica. La hipótesis central sostiene que **las plataformas digitales han fragmentado** el discurso científico tradicional.\n\n## Metodología\n\nSe emplearon tres métodos complementarios:\n\n1. Análisis cuantitativo de publicaciones (2015–2024)\n2. Entrevistas semiestructuradas con 42 investigadores\n3. Revisión sistemática de la literatura\n\n> "La comunicación científica no es solo transmisión de conocimiento, sino construcción colectiva de significado." — Latour, 2004\n\n## Resultados preliminares\n\nLos datos muestran un incremento del 340% en citas provenientes de fuentes digitales durante el período estudiado.`
	}}
/>

<Story
	name="Readonly"
	args={{
		value: `# Versión archivada\n\nEste documento es de solo lectura. No se pueden realizar cambios.`,
		readonly: true
	}}
/>
