<script lang="ts">
	import { base } from '$app/paths';
	import type { PendingAction } from '$lib/server/trpc/routers/ai';

	type Props = {
		action: PendingAction;
		projectId: string;
		onconfirm: (documentId: string) => void;
		ondiscard: () => void;
	};

	let { action, projectId, onconfirm, ondiscard }: Props = $props();

	const docTypeLabel: Record<string, string> = {
		paper: 'Artículo',
		notes: 'Notas',
		outline: 'Esquema',
		bibliography: 'Bibliografía',
		supplementary: 'Suplementario'
	};

	const wordCount = $derived(
		action.content.trim() ? action.content.trim().split(/\s+/).length : 0
	);

	let status: 'idle' | 'loading' | 'done' | 'discarded' = $state('idle');
	let createdDocId = $state('');

	async function confirm() {
		if (status !== 'idle') return;
		status = 'loading';
		try {
			const { trpc } = await import('$lib/utils/trpc');
			const result = await trpc.ai.applyAction.mutate({
				projectId,
				action: {
					type: 'create_document',
					title: action.title,
					docType: action.docType,
					content: action.content,
					requirementId: action.requirementId
				}
			});
			createdDocId = result.documentId;
			status = 'done';
			onconfirm(result.documentId);
		} catch {
			status = 'idle';
		}
	}

	function discard() {
		status = 'discarded';
		ondiscard();
	}
</script>

{#if status !== 'discarded'}
	<div
		class="mt-2 overflow-hidden rounded-xl border transition-colors
		{status === 'done'
			? 'border-green-200 bg-green-50 dark:border-green-900/40 dark:bg-green-950/20'
			: 'border-accent/20 bg-accent/5 dark:border-accent/15 dark:bg-accent/5'}"
	>
		<div class="flex items-start gap-3 px-4 pt-4">
			<!-- Icon -->
			<div
				class="mt-0.5 shrink-0 rounded-lg p-2
				{status === 'done'
					? 'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400'
					: 'bg-accent/10 text-accent'}"
			>
				{#if status === 'done'}
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				{:else}
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
						<polyline points="14 2 14 8 20 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				{/if}
			</div>

			<!-- Info -->
			<div class="min-w-0 flex-1">
				<p class="font-sans text-[11px] font-semibold uppercase tracking-wide
					{status === 'done' ? 'text-green-600 dark:text-green-400' : 'text-accent'}">
					{status === 'done' ? 'Documento creado' : 'Crear documento'}
				</p>
				<p class="mt-0.5 font-serif text-sm font-semibold text-ink dark:text-dark-ink">
					{action.title}
				</p>
				<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
					{docTypeLabel[action.docType] ?? action.docType}
					{#if wordCount > 0} · ~{wordCount.toLocaleString()} palabras{/if}
					{#if action.requirementId} · vincula requisito{/if}
				</p>
			</div>
		</div>

		<!-- Actions -->
		<div class="flex justify-end gap-2 px-4 pb-3 pt-3">
			{#if status === 'done'}
				<a
					href="{base}/projects/{projectId}/documents/{createdDocId}"
					class="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 font-sans text-xs font-medium text-white transition-opacity hover:opacity-90"
				>
					Abrir documento
					<svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				</a>
			{:else}
				<button
					onclick={discard}
					disabled={status === 'loading'}
					class="rounded-lg px-3 py-1.5 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-border disabled:opacity-40 dark:text-dark-ink-muted dark:hover:bg-dark-paper-border"
				>
					Descartar
				</button>
				<button
					onclick={confirm}
					disabled={status === 'loading'}
					class="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 font-sans text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
				>
					{#if status === 'loading'}
						<svg class="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none">
							<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" stroke-dasharray="32" stroke-dashoffset="12" />
						</svg>
						Creando…
					{:else}
						<svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						Crear
					{/if}
				</button>
			{/if}
		</div>
	</div>
{/if}
