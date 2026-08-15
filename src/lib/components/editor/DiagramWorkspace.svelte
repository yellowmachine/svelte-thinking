<script lang="ts">
	// Code + live preview for a 'diagram' document. The third pane (AI chat)
	// is the existing AiEditorPanel sidebar in the parent page — it's already
	// generic over document content, so diagrams reuse it as-is rather than
	// duplicating a chat UI here.
	import DiagramEditor from './DiagramEditor.svelte';
	import MermaidPreview from './MermaidPreview.svelte';

	let {
		value = $bindable(''),
		readonly = false,
		ondocchange
	}: {
		value?: string;
		readonly?: boolean;
		ondocchange?: (content: string) => void;
	} = $props();
</script>

<div class="flex h-full min-h-0 flex-1 overflow-hidden">
	<div
		class="flex w-1/2 min-w-0 flex-col overflow-hidden border-r border-paper-border dark:border-dark-paper-border"
	>
		<DiagramEditor bind:value {readonly} {ondocchange} />
	</div>
	<div class="w-1/2 min-w-0 overflow-hidden">
		<MermaidPreview code={value} />
	</div>
</div>
