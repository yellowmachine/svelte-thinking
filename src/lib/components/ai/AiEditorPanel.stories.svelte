<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import AiEditorPanel from './AiEditorPanel.svelte';

	const { Story } = defineMeta({
		title: 'AI/AiEditorPanel',
		component: AiEditorPanel,
		tags: ['autodocs'],
		decorators: [
			() => ({ template: '<div style="height: 600px; width: 380px;"><story /></div>' })
		]
	});

	// ── Fixture data ──────────────────────────────────────────────────────────

	const reviewConversation = [
		{
			role: 'user',
			content: 'Revisa la redacción del párrafo de introducción. El tono me parece demasiado informal.'
		},
		{
			role: 'assistant',
			content:
				'La introducción tiene buena estructura pero usa construcciones coloquiales que reducen el registro académico. He identificado tres puntos concretos de mejora.',
			sections: [
				{
					label: '✦ Desarrollo',
					body: 'El principal problema está en el uso de "en este trabajo vamos a ver" (línea 2), que puede sustituirse por "el presente trabajo analiza" o "este artículo examina". También "es obvio que" introduce un juicio sin respaldo; mejor eliminarlo o reformularlo como "los datos sugieren que".'
				},
				{
					label: '◎ Referencias al proyecto',
					body: 'Basado en el documento "Introducción — borrador v2", párrafo que empieza por "En este trabajo vamos a…"'
				},
				{
					label: '◈ Sugerencias',
					body: '• Sustituir verbos en primera persona plural por construcciones impersonales.\n• Eliminar "es obvio que" y "está claro que".\n• Añadir una oración de cierre que anticipe la estructura del artículo.'
				},
				{
					label: '→ Próximos pasos',
					body: '• Aplicar los cambios sugeridos.\n• Pedir una segunda revisión de cohesión entre la introducción y el marco teórico.'
				}
			]
		}
	];

	const draftConversation = [
		{
			role: 'user',
			content: 'Genera un borrador de la sección de Discusión basándote en mis notas de resultados.'
		},
		{
			role: 'assistant',
			content:
				'He encontrado tus notas de resultados y el esquema del capítulo. Aquí tienes un borrador de la Discusión en estilo académico formal.',
			sections: [
				{
					label: '◈ Borrador generado',
					body: '## Discusión\n\nLos resultados obtenidos confirman la hipótesis central del estudio: existe una correlación significativa entre las variables X e Y (p < 0.05). Este hallazgo es consistente con los trabajos de [Autor, año] y [Autor, año], quienes observaron patrones similares en contextos comparables.\n\nSin embargo, la magnitud del efecto es menor a la predicha en el modelo teórico inicial, lo que sugiere la presencia de variables mediadoras no contempladas en el diseño original...'
				},
				{
					label: '◎ Referencias al proyecto',
					body: 'Basado en "Notas de resultados — experimento 1" y "Esquema Capítulo 3".'
				},
				{
					label: '→ Próximos pasos',
					body: '• Revisar las citas marcadas como [Autor, año] y sustituirlas por referencias reales.\n• Ampliar el apartado de limitaciones.\n• Confirmar si quieres que lo guarde como documento nuevo.'
				}
			]
		}
	];

	const structureConversation = [
		{
			role: 'user',
			content: '¿El orden de mis secciones tiene sentido para un artículo de ciencias sociales?'
		},
		{
			role: 'assistant',
			content:
				'La estructura general sigue el modelo IMRyD pero hay un desajuste entre el marco teórico y la metodología que puede confundir al lector.',
			sections: [
				{
					label: '⬡ Análisis de estructura',
					body: 'Tu orden actual: Introducción → Resultados → Marco teórico → Metodología → Discusión. El problema: los Resultados aparecen antes que la Metodología, lo que rompe la cadena lógica. El lector necesita saber cómo obtuviste los datos antes de verlos.'
				},
				{
					label: '◈ Orden recomendado',
					body: '1. Introducción\n2. Marco teórico\n3. Metodología\n4. Resultados\n5. Discusión\n6. Conclusiones'
				},
				{
					label: '→ Próximos pasos',
					body: '• Reordenar las secciones.\n• Revisar las frases de transición entre marco teórico y metodología.\n• Añadir un párrafo de cierre en la introducción que anticipe la estructura.'
				}
			]
		}
	];
</script>

<!-- Estado vacío: sin modo seleccionado. Lo que ve el usuario al abrir el panel por primera vez. -->
<Story name="Empty state" />

<!-- Modo "Revisar redacción" seleccionado, sin mensajes aún. -->
<Story name="Mode selected — Review" args={{ initialMode: 'review' }} />

<!-- Modo "Generar borrador" seleccionado, sin mensajes. -->
<Story name="Mode selected — Draft" args={{ initialMode: 'draft' }} />

<!-- Conversación de revisión de redacción con respuesta estructurada completa. -->
<Story
	name="Conversation — Review in progress"
	args={{
		initialMode: 'review',
		messages: reviewConversation
	}}
/>

<!-- Conversación de generación de borrador con secciones colapsables. -->
<Story
	name="Conversation — Draft generated"
	args={{
		initialMode: 'draft',
		messages: draftConversation
	}}
/>

<!-- Conversación de análisis de estructura. -->
<Story
	name="Conversation — Structure analysis"
	args={{
		initialMode: 'structure',
		messages: structureConversation
	}}
/>

<!-- Panel avanzado (motor de IA) abierto desde el inicio. -->
<Story
	name="Advanced panel open"
	args={{
		advancedOpen: true,
		provider: 'Perplexity',
		model: 'Sonar Pro'
	}}
/>

<!-- Vista completa: modo activo + conversación + panel avanzado. -->
<Story
	name="Full — Review with advanced open"
	args={{
		initialMode: 'review',
		messages: reviewConversation,
		advancedOpen: true,
		provider: 'OpenRouter',
		model: 'Claude Sonnet 4.5'
	}}
/>
