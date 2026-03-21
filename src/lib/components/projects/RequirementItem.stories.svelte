<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { fn } from 'storybook/test';
	import RequirementItem from './RequirementItem.svelte';

	const { Story } = defineMeta({
		title: 'Projects/RequirementItem',
		component: RequirementItem,
		tags: ['autodocs'],
		decorators: [
			() => ({ template: '<ul class="max-w-xl p-4 space-y-3"><story /></ul>' })
		],
		args: {
			projectId: 'proj-123',
			isOwner: true,
			pickerOpen: false,
			fulfilling: false,
			onfulfill: fn(),
			onunfulfill: fn(),
			ondelete: fn(),
			ontogglePicker: fn()
		}
	});

	const sampleDocs = [
		{ id: 'doc-1', title: 'Introducción al tratamiento', type: 'paper' },
		{ id: 'doc-2', title: 'Notas de campo', type: 'notes' },
		{ id: 'doc-3', title: 'Esquema general', type: 'outline' }
	];
</script>

<!-- Pendiente, obligatorio -->
<Story
	name="Pending (required)"
	args={{
		requirement: {
			id: 'req-1',
			name: 'Resumen ejecutivo',
			description: 'Síntesis del documento en no más de 250 palabras. Debe incluir objetivo, metodología y conclusiones principales.',
			required: true,
			fulfilledDocumentId: null
		},
		documents: sampleDocs
	}}
/>

<!-- Pendiente, opcional -->
<Story
	name="Pending (optional)"
	args={{
		requirement: {
			id: 'req-2',
			name: 'Agradecimientos',
			description: 'Mencionar entidades o personas que hayan colaborado en la investigación.',
			required: false,
			fulfilledDocumentId: null
		},
		documents: sampleDocs
	}}
/>

<!-- Picker abierto con documentos disponibles -->
<Story
	name="Picker open"
	args={{
		requirement: {
			id: 'req-3',
			name: 'Metodología',
			description: 'Descripción detallada del diseño del estudio, muestra, instrumentos y análisis estadístico.',
			required: true,
			fulfilledDocumentId: null
		},
		documents: sampleDocs,
		pickerOpen: true
	}}
/>

<!-- Picker abierto sin documentos -->
<Story
	name="Picker open (no documents)"
	args={{
		requirement: {
			id: 'req-4',
			name: 'Resultados',
			description: null,
			required: true,
			fulfilledDocumentId: null
		},
		documents: [],
		pickerOpen: true
	}}
/>

<!-- Cumplido -->
<Story
	name="Fulfilled"
	args={{
		requirement: {
			id: 'req-5',
			name: 'Introducción',
			description: 'Contextualización del problema, antecedentes y justificación del estudio.',
			required: true,
			fulfilledDocumentId: 'doc-1'
		},
		documents: sampleDocs
	}}
/>

<!-- Cumplido, opcional -->
<Story
	name="Fulfilled (optional)"
	args={{
		requirement: {
			id: 'req-6',
			name: 'Anexos',
			description: null,
			required: false,
			fulfilledDocumentId: 'doc-2'
		},
		documents: sampleDocs
	}}
/>

<!-- Vista de solo lectura (no owner) -->
<Story
	name="Read-only (not owner)"
	args={{
		requirement: {
			id: 'req-7',
			name: 'Discusión',
			description: 'Interpretación de los resultados en relación con la literatura existente.',
			required: true,
			fulfilledDocumentId: null
		},
		documents: sampleDocs,
		isOwner: false
	}}
/>

<!-- Cargando (fulfilling) -->
<Story
	name="Loading"
	args={{
		requirement: {
			id: 'req-8',
			name: 'Conclusiones',
			description: null,
			required: true,
			fulfilledDocumentId: null
		},
		documents: sampleDocs,
		pickerOpen: true,
		fulfilling: true
	}}
/>
