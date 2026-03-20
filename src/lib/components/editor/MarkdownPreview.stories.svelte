<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import MarkdownPreview from './MarkdownPreview.svelte';

	const { Story } = defineMeta({
		title: 'Editor/MarkdownPreview',
		component: MarkdownPreview,
		tags: ['autodocs'],
		args: {
			projectId: null
		}
	});
</script>

<Story
	name="Markdown básico"
	args={{
		content: `# Título del documento

Un párrafo con **texto en negrita**, *cursiva*, y \`código inline\`.

## Lista de referencias

- Elemento uno
- Elemento dos con [enlace externo](https://example.com)

> "La comunicación científica no es solo transmisión de conocimiento, sino construcción colectiva de significado." — Latour, 2004

## Tabla

| Método | Muestra | Resultado |
|--------|---------|-----------|
| Cuantitativo | 420 | p < 0.01 |
| Cualitativo | 42 | Saturación teórica |
`
	}}
/>

<Story
	name="Con matemáticas (KaTeX)"
	args={{
		content: `# Fundamentos matemáticos

La regresión lineal minimiza la función de coste:

$$J(\\theta) = \\frac{1}{2m} \\sum_{i=1}^{m} (h_\\theta(x^{(i)}) - y^{(i)})^2$$

Donde $h_\\theta(x) = \\theta^T x$ es la hipótesis del modelo.

## Distribución normal

La función de densidad de probabilidad es $f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}} e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}$.

Para la transformada de Fourier:

$$\\hat{f}(\\xi) = \\int_{-\\infty}^{\\infty} f(x)\\, e^{-2\\pi i x \\xi}\\, dx$$
`
	}}
/>

<Story
	name="Con citas (APA)"
	args={{
		citationStyle: 'apa',
		references: [
			{
				citeKey: 'latour2004',
				type: 'book',
				authors: [{ first: 'Bruno', last: 'Latour' }],
				title: 'Science in Action',
				year: '2004',
				publisher: 'Harvard University Press'
			},
			{
				citeKey: 'merton1973',
				type: 'book',
				authors: [{ first: 'Robert K.', last: 'Merton' }],
				title: 'The Sociology of Science',
				year: '1973',
				publisher: 'University of Chicago Press'
			}
		],
		content: `# Marco teórico

Según [@latour2004], la ciencia es una construcción social mediada por redes de actores humanos y no humanos. Este enfoque contrasta con la visión normativa clásica propuesta por [@merton1973], quien identificó cuatro normas institucionales: universalismo, comunismo, desinterés y escepticismo organizado.

## Referencias
`
	}}
/>

<Story
	name="Vacío"
	args={{
		content: ''
	}}
/>
