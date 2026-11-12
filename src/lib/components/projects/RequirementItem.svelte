<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import Trash from '@lucide/svelte/icons/trash';
	import { DOCUMENT_TYPE_LABELS } from '$lib/domain/document';

	import { resolve } from '$app/paths';
	let {
		requirement,
		documents,
		projectId,
		isOwner,
		pickerOpen = false,
		fulfilling = false,
		onfulfill,
		onunfulfill,
		ondelete,
		ontogglePicker
	}: {
		requirement: {
			name: string;
			description: string | null;
			required: boolean;
			fulfilledDocumentId: string | null;
		};
		documents: { id: string; title: string; type: string }[];
		projectId: string;
		isOwner: boolean;
		pickerOpen?: boolean;
		fulfilling?: boolean;
		onfulfill?: (documentId: string) => void;
		onunfulfill?: () => void;
		ondelete?: () => void;
		ontogglePicker?: () => void;
	} = $props();

	const isFulfilled = $derived(requirement.fulfilledDocumentId !== null);

	const fulfilledDocTitle = $derived(
		requirement.fulfilledDocumentId
			? (documents.find((d) => d.id === requirement.fulfilledDocumentId)?.title ??
					'(deleted document)')
			: ''
	);
</script>

<li
	class="group rounded-xl border transition-colors {isFulfilled
		? 'border-success-border bg-success-bg dark:bg-green-950/20'
		: 'border-paper-border bg-paper'}"
>
	<div class="flex items-start gap-3 p-4">
		<!-- Check indicator -->
		<div class="mt-0.5 shrink-0">
			{#if isFulfilled}
				<div class="flex h-5 w-5 items-center justify-center rounded-full bg-green-500">
					<svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
						<path
							d="M2 6l3 3 5-5"
							stroke="white"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</div>
			{:else}
				<div class="h-5 w-5 rounded-full border-2 border-paper-border"></div>
			{/if}
		</div>

		<div class="min-w-0 flex-1">
			<!-- Name + optional badge -->
			<div class="flex flex-wrap items-center gap-2">
				<span class="font-sans text-sm font-semibold text-ink">{requirement.name}</span>
				{#if !requirement.required}
					<span
						class="rounded-full bg-paper-border px-2 py-0.5 font-sans text-[10px] font-medium tracking-wide text-ink-faint uppercase"
					>
						Optional
					</span>
				{/if}
			</div>

			{#if requirement.description}
				<p class="mt-0.5 font-sans text-xs leading-relaxed text-ink-muted">
					{requirement.description}
				</p>
			{/if}

			<!-- Fulfilled state -->
			{#if isFulfilled}
				<div class="mt-2 flex flex-wrap items-center gap-2">
					<a
						href={resolve(`/projects/${projectId}/documents/${requirement.fulfilledDocumentId}`)}
						class="flex items-center gap-1.5 rounded-md border border-success-border bg-white px-2.5 py-1 font-sans text-xs font-medium text-success transition-colors hover:bg-success-bg dark:bg-dark-paper"
					>
						<svg
							width="11"
							height="11"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
							<polyline points="14 2 14 8 20 8" />
						</svg>
						{fulfilledDocTitle}
					</a>
					{#if isOwner}
						<button
							onclick={onunfulfill}
							disabled={fulfilling}
							class="font-sans text-xs text-ink-faint underline-offset-2 hover:text-ink hover:underline disabled:opacity-40"
						>
							Change
						</button>
					{/if}
				</div>

				<!-- Pending state (owner) -->
			{:else if isOwner}
				{#if pickerOpen}
					<div class="mt-2 rounded-lg border border-paper-border bg-paper-ui p-2">
						{#if documents.length === 0}
							<p class="px-1 font-sans text-xs text-ink-muted">No documents in this project.</p>
						{:else}
							<ul class="max-h-44 space-y-0.5 overflow-y-auto">
								{#each documents as doc (doc.id)}
									<li>
										<button
											onclick={() => onfulfill?.(doc.id)}
											disabled={fulfilling}
											class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-sans text-xs transition-colors hover:bg-paper-border disabled:opacity-40"
										>
											<span
												class="rounded bg-paper-border px-1.5 py-0.5 font-sans text-[10px] text-ink-faint"
											>
												{DOCUMENT_TYPE_LABELS[doc.type as keyof typeof DOCUMENT_TYPE_LABELS] ??
													doc.type}
											</span>
											<span class="min-w-0 truncate text-ink">{doc.title}</span>
										</button>
									</li>
								{/each}
							</ul>
						{/if}
						<button
							onclick={ontogglePicker}
							class="mt-1.5 w-full rounded-md py-1 font-sans text-xs text-ink-muted hover:text-ink"
						>
							Cancel
						</button>
					</div>
				{:else}
					<button
						onclick={ontogglePicker}
						class="mt-2 flex items-center gap-1.5 font-sans text-xs text-accent-ink underline-offset-2 hover:underline"
					>
						<Plus size={11} strokeWidth={1.75} aria-hidden="true" />
						Assign document
					</button>
				{/if}
			{/if}
		</div>

		<!-- Delete (owner only, visible on row hover) -->
		{#if isOwner}
			<button
				onclick={ondelete}
				title="Delete requirement"
				class="shrink-0 rounded p-1 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink"
			>
				<Trash size={13} strokeWidth={1.75} aria-hidden="true" />
			</button>
		{/if}
	</div>
</li>
