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
	name="Con citas (Chicago)"
	args={{
		citationStyle: 'chicago',
		references: [
			{
				citeKey: 'dennett1991',
				type: 'book',
				authors: [{ first: 'Daniel C.', last: 'Dennett' }],
				title: 'Consciousness Explained',
				year: '1991',
				publisher: 'Little, Brown',
				address: 'Boston'
			},
			{
				citeKey: 'dennett2003',
				type: 'book',
				authors: [{ first: 'Daniel C.', last: 'Dennett' }],
				title: 'Freedom Evolves',
				year: '2003',
				publisher: 'Viking',
				address: 'New York'
			},
			{
				citeKey: 'mises1949',
				type: 'book',
				authors: [{ first: 'Ludwig von', last: 'Mises' }],
				title: 'Human Action: A Treatise on Economics',
				year: '1949',
				publisher: 'Yale University Press',
				address: 'New Haven'
			},
			{
				citeKey: 'mises1957',
				type: 'book',
				authors: [{ first: 'Ludwig von', last: 'Mises' }],
				title: 'Theory and History',
				year: '1957',
				publisher: 'Yale University Press',
				address: 'New Haven'
			}
		],
		content: `# Intencionalidad y acción humana

La teoría de la intencionalidad desarrollada por [@dennett1991] sostiene que la conciencia no es una entidad sustancial sino un proceso emergente de patrones de información. Esta perspectiva tiene implicaciones directas para la comprensión de la acción deliberada.

Desde una óptica radicalmente distinta, [@mises1949] define la *praxeología* como la ciencia de la acción humana intencional: toda acción supone un fin, medios escogidos y la expectativa de mejorar la situación del agente. La racionalidad no es un requisito psicológico sino la estructura lógica de la acción misma.

La compatibilidad entre el naturalismo de [@dennett2003] y el apriorismo de [@mises1957] es uno de los problemas filosóficos más sugerentes de la teoría de la acción contemporánea.
`
	}}
/>

<Story
	name="Con citas (IEEE)"
	args={{
		citationStyle: 'ieee',
		references: [
			{
				citeKey: 'vaswani2017',
				type: 'inproceedings',
				authors: [
					{ first: 'Ashish', last: 'Vaswani' },
					{ first: 'Noam', last: 'Shazeer' },
					{ first: 'Niki', last: 'Parmar' },
					{ first: 'Jakob', last: 'Uszkoreit' }
				],
				title: 'Attention Is All You Need',
				year: '2017',
				booktitle: 'Advances in Neural Information Processing Systems'
			},
			{
				citeKey: 'lecun2015',
				type: 'article',
				authors: [
					{ first: 'Yann', last: 'LeCun' },
					{ first: 'Yoshua', last: 'Bengio' },
					{ first: 'Geoffrey', last: 'Hinton' }
				],
				title: 'Deep Learning',
				year: '2015',
				journal: 'Nature',
				volume: '521',
				pages: '436–444',
				doi: '10.1038/nature14539'
			}
		],
		content: `# Arquitecturas de atención

Los modelos transformer [@vaswani2017] sustituyeron las redes recurrentes mediante mecanismos de auto-atención, permitiendo paralelización completa durante el entrenamiento. Esta arquitectura se construye sobre los fundamentos del aprendizaje profundo establecidos por [@lecun2015].
`
	}}
/>

<Story
	name="Con citas (Vancouver)"
	args={{
		citationStyle: 'vancouver',
		references: [
			{
				citeKey: 'who2023',
				type: 'misc',
				authors: [{ first: '', last: 'World Health Organization' }],
				title: 'Global Health Statistics 2023',
				year: '2023',
				url: 'https://www.who.int/data/gho'
			},
			{
				citeKey: 'smith2021',
				type: 'article',
				authors: [
					{ first: 'John A.', last: 'Smith' },
					{ first: 'Maria', last: 'García' }
				],
				title: 'Randomized controlled trial of intervention X in population Y',
				year: '2021',
				journal: 'The Lancet',
				volume: '398',
				issue: '10305',
				pages: '1023–1031',
				doi: '10.1016/S0140-6736(21)01234-5'
			}
		],
		content: `# Metodología clínica

La intervención fue diseñada siguiendo las recomendaciones internacionales de [@who2023]. El ensayo controlado aleatorizado reportado por [@smith2021] mostró una reducción significativa en la incidencia del evento primario.
`
	}}
/>

<Story
	name="Vacío"
	args={{
		content: ''
	}}
/>
