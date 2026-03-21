<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { fn } from 'storybook/test';
	import ActionCard from './ActionCard.svelte';

	const { Story } = defineMeta({
		title: 'AI/ActionCard',
		component: ActionCard,
		tags: ['autodocs'],
		decorators: [
			() => ({ template: '<div class="max-w-sm p-4"><story /></div>' })
		],
		args: {
			projectId: 'proj-123',
			onconfirm: fn(),
			ondiscard: fn()
		}
	});

	const longContent = `## Discusión

Los resultados obtenidos muestran una correlación significativa entre las variables analizadas (p < 0.05),
lo que confirma la hipótesis planteada en la introducción. En consonancia con estudios previos [@smith2022],
se observa que el efecto es especialmente pronunciado en el grupo de control.

Sin embargo, es necesario considerar las limitaciones metodológicas descritas en la sección anterior.
La muestra, aunque representativa, no permite generalizar los hallazgos a poblaciones con características
distintas a las del estudio. Futuras investigaciones deberían ampliar el tamaño muestral para validar
estos resultados de forma más robusta.

En conjunto, los datos apoyan un modelo explicativo en el que las variables contextuales median la relación
entre los factores primarios y los resultados observados.`;

	const shortContent = `Notas de la entrevista con el Dr. García (15 de enero).
Temas clave: financiación, metodología cualitativa, próximos pasos.`;
</script>

<!-- Propuesta de artículo con contenido extenso — caso más habitual -->
<Story
	name="Paper (long content)"
	args={{
		action: {
			type: 'create_document',
			title: 'Discusión',
			docType: 'paper',
			content: longContent
		}
	}}
/>

<!-- Documento con requisito vinculado — muestra el badge extra -->
<Story
	name="With linked requirement"
	args={{
		action: {
			type: 'create_document',
			title: 'Conclusiones',
			docType: 'paper',
			content: longContent,
			requirementId: 'req-abc123'
		}
	}}
/>

<!-- Notas cortas -->
<Story
	name="Notes (short content)"
	args={{
		action: {
			type: 'create_document',
			title: 'Notas de entrevista — Dr. García',
			docType: 'notes',
			content: shortContent
		}
	}}
/>

<!-- Esquema -->
<Story
	name="Outline"
	args={{
		action: {
			type: 'create_document',
			title: 'Esquema del capítulo 3',
			docType: 'outline',
			content: '- Introducción al problema\n- Antecedentes\n- Marco teórico\n- Hipótesis de trabajo'
		}
	}}
/>

<!-- Bibliografía -->
<Story
	name="Bibliography"
	args={{
		action: {
			type: 'create_document',
			title: 'Referencias bibliográficas',
			docType: 'bibliography',
			content: '[@smith2022] [@jones2021] [@garcia2023]'
		}
	}}
/>

<!-- Sin contenido — edge case si el modelo falla al generar -->
<Story
	name="Empty content"
	args={{
		action: {
			type: 'create_document',
			title: 'Resumen ejecutivo',
			docType: 'paper',
			content: ''
		}
	}}
/>

<!-- En contexto: simulación de cómo aparece debajo de una burbuja del agente -->
<Story name="In chat context" decorators={[() => ({ template: '<div class="max-w-sm p-4"><story /></div>' })]}>
	{#snippet children({ args })}
		<div class="flex flex-col gap-1">
			<!-- Burbuja del agente -->
			<div class="flex gap-3">
				<div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-paper-border font-sans text-xs font-semibold text-ink-muted">
					AI
				</div>
				<div class="flex max-w-[80%] flex-col">
					<div class="rounded-2xl rounded-tl-sm bg-paper-ui px-4 py-3 font-sans text-sm leading-relaxed text-ink">
						He leído tu sección de Metodología y redactado un borrador de la Discusión basándome en los resultados
						que describes. Aquí tienes la propuesta:
					</div>
					<ActionCard
						action={{
							type: 'create_document',
							title: 'Discusión',
							docType: 'paper',
							content: longContent,
							requirementId: 'req-discussion'
						}}
						projectId="proj-123"
						onconfirm={args.onconfirm}
						ondiscard={args.ondiscard}
					/>
				</div>
			</div>
		</div>
	{/snippet}
</Story>
