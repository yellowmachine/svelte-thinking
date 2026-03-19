<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import DiffViewer from './DiffViewer.svelte';

	const { Story } = defineMeta({
		title: 'Editor/DiffViewer',
		component: DiffViewer,
		tags: ['autodocs']
	});
</script>

<Story
	name="No changes"
	args={{
		oldText: 'El rápido zorro marrón salta sobre el perro perezoso.',
		newText: 'El rápido zorro marrón salta sobre el perro perezoso.',
		oldLabel: 'v1',
		newLabel: 'v2'
	}}
/>

<Story
	name="Word changes"
	args={{
		oldText: `# Introducción\n\nEste trabajo analiza el impacto de las redes sociales en la comunicación académica moderna. Los investigadores han observado cambios significativos en los últimos años.\n\nLa metodología empleada incluye análisis cuantitativo y revisión bibliográfica exhaustiva.`,
		newText: `# Introducción\n\nEste artículo examina el impacto de las plataformas digitales en la comunicación científica contemporánea. Múltiples investigadores han documentado cambios sustanciales en la última década.\n\nLa metodología empleada incluye análisis cuantitativo, entrevistas semiestructuradas y revisión bibliográfica exhaustiva.`,
		oldLabel: 'v2 — borrador',
		newLabel: 'v3 — revisado'
	}}
/>

<Story
	name="Large diff"
	args={{
		oldText: `# Abstract\n\nThis paper presents a novel approach to distributed consensus algorithms in Byzantine fault-tolerant systems. We propose a new protocol that achieves O(n²) message complexity while maintaining safety and liveness guarantees under asynchronous network conditions.\n\n## Introduction\n\nDistributed systems face fundamental challenges when nodes may behave arbitrarily. Traditional consensus protocols such as PBFT require O(n³) message complexity, which limits scalability to small cluster sizes.\n\nOur contribution addresses this limitation through a novel aggregation scheme.`,
		newText: `# Abstract\n\nThis paper presents a novel approach to distributed consensus algorithms in Byzantine fault-tolerant systems. We propose an efficient protocol that achieves O(n log n) message complexity while maintaining strong safety and liveness guarantees under partially synchronous network conditions.\n\n## Introduction\n\nDistributed systems face fundamental challenges when nodes may behave arbitrarily or maliciously. Classical consensus protocols such as PBFT require O(n³) message complexity, severely limiting scalability beyond small cluster deployments.\n\nOur primary contribution addresses this scalability limitation through a novel threshold signature aggregation scheme combined with pipelined execution.`,
		oldLabel: 'Versión 1',
		newLabel: 'Versión 2'
	}}
/>
