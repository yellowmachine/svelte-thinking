<script lang="ts">
	import MarkdownPreview from './MarkdownPreview.svelte';

	let {
		content = $bindable(),
		saveStatus,
		isDirty,
		projectTitle,
		projectId,
		documentTitle,
		onchange,
		onsave
	}: {
		content: string;
		saveStatus: 'idle' | 'pending' | 'saving' | 'saved' | 'error';
		isDirty: boolean;
		projectTitle: string;
		projectId: string;
		documentTitle: string;
		onchange: (value: string) => void;
		onsave: () => void;
	} = $props();

	let mode: 'edit' | 'preview' = $state('edit');

	const saveLabel: Record<typeof saveStatus, string> = {
		idle: '',
		pending: 'Sin guardar',
		saving: 'Guardando…',
		saved: 'Guardado',
		error: 'Error'
	};
</script>

<div class="flex h-screen flex-col bg-paper dark:bg-dark-paper">
	<!-- Header -->
	<div
		class="flex shrink-0 items-center justify-between border-b border-paper-border bg-paper/95 px-4 py-3 backdrop-blur-sm dark:border-dark-paper-border dark:bg-dark-paper/95"
	>
		<button
			onclick={() => { window.location.href = `/projects/${projectId}`; }}
			class="flex items-center gap-1.5 font-sans text-sm text-ink-muted dark:text-dark-ink-muted"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M15 18l-6-6 6-6" />
			</svg>
			{projectTitle}
		</button>

		<div class="flex items-center gap-3">
			<!-- Edit / Preview toggle -->
			<div class="flex rounded-md border border-paper-border overflow-hidden dark:border-dark-paper-border">
				<button
					onclick={() => (mode = 'edit')}
					class="px-2.5 py-1 font-sans text-xs transition-colors {mode === 'edit'
						? 'bg-accent text-white'
						: 'text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui'}"
				>
					Editar
				</button>
				<button
					onclick={() => (mode = 'preview')}
					class="px-2.5 py-1 font-sans text-xs transition-colors {mode === 'preview'
						? 'bg-accent text-white'
						: 'text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui'}"
				>
					Ver
				</button>
			</div>

			{#if mode === 'edit'}
				{#if saveStatus !== 'idle'}
					<span
						class="font-sans text-xs {saveStatus === 'error'
							? 'text-red-500'
							: saveStatus === 'saved'
								? 'text-green-600'
								: 'text-ink-faint dark:text-dark-ink-faint'}"
					>
						{saveLabel[saveStatus]}
					</span>
				{/if}
				<button
					onclick={onsave}
					disabled={!isDirty || saveStatus === 'saving'}
					class="rounded-md bg-accent px-3 py-1.5 font-sans text-sm font-medium text-white disabled:opacity-40"
				>
					Guardar
				</button>
			{/if}
		</div>
	</div>

	{#if mode === 'edit'}
		<!-- Document title -->
		<div class="shrink-0 px-4 pt-4 pb-1">
			<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">{documentTitle}</p>
		</div>
		<!-- Textarea -->
		<textarea
			value={content}
			oninput={(e) => onchange((e.target as HTMLTextAreaElement).value)}
			placeholder="Escribe tu nota…"
			spellcheck="true"
			class="flex-1 resize-none bg-transparent px-4 py-2 pb-safe font-sans text-base leading-relaxed text-ink focus:outline-none dark:text-dark-ink"
		></textarea>
	{:else}
		<!-- Rendered preview -->
		<div class="flex-1 overflow-y-auto px-4 py-6 pb-safe">
			{#if content.trim()}
				<MarkdownPreview {content} {projectId} />
			{:else}
				<p class="font-sans text-sm text-ink-faint dark:text-dark-ink-faint">Nota vacía.</p>
			{/if}
		</div>
	{/if}
</div>
