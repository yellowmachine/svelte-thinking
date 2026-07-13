<script lang="ts">
	import { untrack } from 'svelte';
	import { trpc } from '$lib/utils/trpc';
	import { slugify } from '$lib/utils/slug';

	let {
		title,
		handle,
		versionId,
		onpublished,
		onclose
	}: {
		title: string;
		handle: string;
		versionId: string;
		onpublished: (result: { id: string; slug: string; url: string }) => void;
		onclose: () => void;
	} = $props();

	let slugInput = $state(untrack(() => slugify(title)));
	let commentsEnabled = $state(false);
	let publishing = $state(false);
	let error = $state('');

	const previewSlug = $derived(slugify(slugInput) || 'post');

	async function doPublish() {
		publishing = true;
		error = '';
		try {
			const result = await trpc.blog.publish.mutate({
				versionId,
				slug: previewSlug,
				commentsEnabled
			});
			onpublished(result);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Error al publicar.';
		} finally {
			publishing = false;
		}
	}
</script>

<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-4 backdrop-blur-sm dark:bg-dark-ink/30"
>
	<div
		class="w-full max-w-md rounded-2xl border border-paper-border bg-paper p-6 shadow-xl dark:border-dark-paper-border dark:bg-dark-paper"
		role="dialog"
		aria-modal="true"
		aria-labelledby="publish-dialog-title"
	>
		<h2
			id="publish-dialog-title"
			class="font-serif text-xl font-semibold text-ink dark:text-dark-ink"
		>
			Publicar en el blog
		</h2>
		<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Esta versión quedará publicada de forma permanente en la URL de abajo.
		</p>

		<div class="mt-4 flex flex-col gap-3">
			<div class="flex flex-col gap-1.5">
				<label for="publish-slug" class="font-sans text-sm font-medium text-ink dark:text-dark-ink">
					URL
				</label>
				<div
					class="flex items-center rounded-md border border-paper-border bg-paper-ui px-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
				>
					<span class="shrink-0 font-mono text-xs text-ink-faint dark:text-dark-ink-faint"
						>/@{handle}/</span
					>
					<input
						id="publish-slug"
						type="text"
						bind:value={slugInput}
						placeholder={slugify(title)}
						class="w-full bg-transparent py-2 pl-1 font-mono text-sm text-ink focus:outline-none dark:text-dark-ink"
					/>
				</div>
				<p class="font-mono text-xs text-ink-faint dark:text-dark-ink-faint">
					/@{handle}/{previewSlug}
				</p>
			</div>

			<label class="flex items-center gap-2 font-sans text-sm text-ink dark:text-dark-ink">
				<input type="checkbox" bind:checked={commentsEnabled} class="rounded" />
				Permitir comentarios en esta publicación
			</label>

			{#if error}
				<p class="font-sans text-sm text-red-600 dark:text-red-400">{error}</p>
			{/if}

			<div class="flex gap-3">
				<button
					onclick={doPublish}
					disabled={publishing}
					class="flex-1 rounded-md bg-accent py-2.5 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
				>
					{publishing ? 'Publicando...' : 'Publicar'}
				</button>
				<button
					onclick={onclose}
					disabled={publishing}
					class="rounded-md border border-paper-border px-4 py-2.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui disabled:opacity-50 dark:border-dark-paper-border dark:text-dark-ink-muted"
				>
					Cancelar
				</button>
			</div>
		</div>
	</div>
</div>
