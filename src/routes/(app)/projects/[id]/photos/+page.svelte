<script lang="ts">
	import { trpc } from '$lib/utils/trpc';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let extraPhotos = $state<typeof data.photos>([]);
	let removedIds = $state<Set<string>>(new Set());

	let photos = $derived([
		...extraPhotos,
		...data.photos.filter((p) => !removedIds.has(p.id) && !extraPhotos.some((e) => e.id === p.id))
	]);

	// Staging: files selected but not yet uploaded
	type StagedFile = { file: File; preview: string; description: string };
	let staged = $state<StagedFile[]>([]);

	let uploading = $state(false);
	let uploadError = $state('');
	let dragOver = $state(false);
	let fileInput: HTMLInputElement;
	let lightboxPhoto: (typeof data.photos)[number] | null = $state(null);

	function stageFiles(files: FileList | File[]) {
		uploadError = '';
		const newStaged: StagedFile[] = Array.from(files).map((file) => ({
			file,
			preview: URL.createObjectURL(file),
			description: ''
		}));
		staged = [...staged, ...newStaged];
	}

	function removeStaged(index: number) {
		URL.revokeObjectURL(staged[index].preview);
		staged = staged.filter((_, i) => i !== index);
	}

	async function confirmUpload() {
		uploading = true;
		uploadError = '';
		const uploaded: typeof data.photos = [];

		for (const item of staged) {
			const fd = new FormData();
			fd.append('file', item.file);
			if (item.description.trim()) fd.append('description', item.description.trim());

			const res = await fetch(`/api/projects/${data.project.id}/photos`, {
				method: 'POST',
				body: fd
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({ message: res.statusText }));
				uploadError = err.message ?? 'Error al subir la imagen';
				uploading = false;
				return;
			}

			uploaded.push(await res.json());
		}

		// Revoke object URLs
		staged.forEach((s) => URL.revokeObjectURL(s.preview));
		staged = [];
		extraPhotos = [...uploaded.reverse(), ...extraPhotos];
		uploading = false;
	}

	function cancelStaging() {
		staged.forEach((s) => URL.revokeObjectURL(s.preview));
		staged = [];
		uploadError = '';
	}

	function onFileChange(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		if (input.files?.length) stageFiles(input.files);
		input.value = '';
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		if (e.dataTransfer?.files.length) stageFiles(e.dataTransfer.files);
	}

	async function deletePhoto(id: string) {
		try {
			await trpc.photos.delete.mutate(id);
			removedIds = new Set([...removedIds, id]);
			extraPhotos = extraPhotos.filter((p) => p.id !== id);
			if (lightboxPhoto?.id === id) lightboxPhoto = null;
		} catch (e) {
			alert(e instanceof Error ? e.message : 'Error al eliminar');
		}
	}

	function copyMarkdown(photo: (typeof data.photos)[number]) {
		const md = `![${photo.filename}](${photo.url})`;
		navigator.clipboard.writeText(md);
	}

	function formatSize(bytes: number) {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}
</script>

<div class="mx-auto max-w-5xl px-6 py-8">
	<!-- Header -->
	<div class="mb-8">
		<button
			onclick={() => (window.location.href = `/projects/${data.project.id}`)}
			class="mb-4 flex items-center gap-1.5 font-sans text-sm text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
		>
			<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
				<path
					d="M10 12L6 8l4-4"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
			{data.project.title}
		</button>

		<h1 class="font-serif text-3xl font-semibold text-ink dark:text-dark-ink">Fotos</h1>
		<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Sube fotos de pizarras, notas o esquemas para usarlas en tus documentos.
		</p>
	</div>

	<!-- Upload zone (hidden while staging) -->
	{#if staged.length === 0}
		<button
			type="button"
			class="mb-6 w-full cursor-pointer rounded-xl border-2 border-dashed transition-colors {dragOver
				? 'border-accent bg-accent/5'
				: 'border-paper-border hover:border-accent/50 dark:border-dark-paper-border'}"
			ondragover={(e) => { e.preventDefault(); dragOver = true; }}
			ondragleave={() => (dragOver = false)}
			ondrop={onDrop}
			onclick={() => fileInput.click()}
		>
			<div class="flex flex-col items-center gap-3 px-6 py-10 text-center">
				<svg
					width="32"
					height="32"
					viewBox="0 0 24 24"
					fill="none"
					class="text-ink-faint dark:text-dark-ink-faint"
					aria-hidden="true"
				>
					<path
						d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				<div>
					<p class="font-sans text-sm font-medium text-ink dark:text-dark-ink">
						Arrastra fotos aquí o haz clic para seleccionar
					</p>
					<p class="mt-0.5 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
						JPG, PNG, WebP, GIF · Máx. 10 MB
					</p>
				</div>
			</div>
		</button>
	{/if}
	<input
		bind:this={fileInput}
		type="file"
		accept="image/*"
		multiple
		class="hidden"
		onchange={onFileChange}
	/>

	<!-- Staging area -->
	{#if staged.length > 0}
		<div class="mb-6 rounded-xl border border-accent/30 bg-paper p-5 dark:bg-dark-paper">
			<h2 class="mb-4 font-serif text-base font-semibold text-ink dark:text-dark-ink">
				{staged.length === 1 ? '1 foto lista para subir' : `${staged.length} fotos listas para subir`}
			</h2>

			<div class="flex flex-col gap-4">
				{#each staged as item, i (item.preview)}
					<div class="flex gap-4">
						<!-- Preview -->
						<div class="relative shrink-0">
							<img
								src={item.preview}
								alt="Vista previa"
								class="h-20 w-20 rounded-lg object-cover"
							/>
							<button
								type="button"
								aria-label="Quitar"
								onclick={() => removeStaged(i)}
								class="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-white shadow"
							>
								<svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
									<path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
								</svg>
							</button>
						</div>

						<!-- Description input -->
						<div class="flex flex-1 flex-col justify-center gap-1">
							<p class="truncate font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
								{item.file.name} · {formatSize(item.file.size)}
							</p>
							<textarea
								bind:value={item.description}
								placeholder="Nota u observación (opcional)"
								rows="2"
								class="w-full resize-none rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
							></textarea>
						</div>
					</div>
				{/each}
			</div>

			{#if uploadError}
				<p class="mt-3 rounded-lg bg-red-50 px-3 py-2 font-sans text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
					{uploadError}
				</p>
			{/if}

			<div class="mt-4 flex items-center gap-3">
				<button
					type="button"
					onclick={confirmUpload}
					disabled={uploading}
					class="flex items-center gap-2 rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
				>
					{#if uploading}
						<div class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
						Subiendo...
					{:else}
						Subir {staged.length === 1 ? 'foto' : `${staged.length} fotos`}
					{/if}
				</button>
				<button
					type="button"
					onclick={cancelStaging}
					disabled={uploading}
					class="rounded-md border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui disabled:opacity-50 dark:border-dark-paper-border dark:text-dark-ink-muted"
				>
					Cancelar
				</button>
				<button
					type="button"
					onclick={() => fileInput.click()}
					disabled={uploading}
					class="ml-auto rounded-md border border-paper-border px-3 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui disabled:opacity-50 dark:border-dark-paper-border dark:text-dark-ink-muted"
				>
					+ Añadir más
				</button>
			</div>
		</div>
	{/if}

	<!-- Gallery grid -->
	{#if photos.length === 0}
		<div class="rounded-xl border border-dashed border-paper-border py-16 text-center dark:border-dark-paper-border">
			<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				Sin fotos todavía. Sube la primera desde el móvil o el ordenador.
			</p>
		</div>
	{:else}
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
			{#each photos as photo (photo.id)}
				<div class="group relative overflow-hidden rounded-xl border border-paper-border bg-paper dark:border-dark-paper-border dark:bg-dark-paper">
					<button
						type="button"
						class="block w-full"
						onclick={() => (lightboxPhoto = photo)}
						aria-label="Ver {photo.filename}"
					>
						<img
							src={photo.url}
							alt={photo.description ?? photo.filename}
							class="aspect-square w-full object-cover transition-transform duration-200 group-hover:scale-105"
						/>
					</button>
					{#if photo.description}
						<div class="px-2.5 py-2">
							<p class="line-clamp-2 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
								{photo.description}
							</p>
						</div>
					{/if}
					<!-- Hover overlay -->
					<div class="pointer-events-none absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-black/60 via-transparent to-transparent p-2 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
						<div class="flex justify-end gap-1.5">
							<button
								title="Copiar markdown"
								onclick={() => copyMarkdown(photo)}
								class="rounded-md bg-white/90 p-1.5 text-ink transition-colors hover:bg-white"
							>
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
									<rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="1.5" />
									<path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="1.5" />
								</svg>
							</button>
							{#if photo.uploadedBy === data.currentUserId}
								<button
									title="Eliminar"
									onclick={() => deletePhoto(photo.id)}
									class="rounded-md bg-white/90 p-1.5 text-red-600 transition-colors hover:bg-white"
								>
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
										<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
									</svg>
								</button>
							{/if}
						</div>
						<p class="truncate font-sans text-xs text-white/90">{formatSize(photo.size)}</p>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- Lightbox -->
{#if lightboxPhoto}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
		onclick={() => (lightboxPhoto = null)}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="relative max-h-full max-w-4xl" onclick={(e) => e.stopPropagation()}>
			<img
				src={lightboxPhoto.url}
				alt={lightboxPhoto.description ?? lightboxPhoto.filename}
				class="max-h-[85vh] max-w-full rounded-xl object-contain shadow-2xl"
			/>
			<div class="mt-3 flex flex-col gap-2">
				{#if lightboxPhoto.description}
					<p class="font-sans text-sm text-white/90">{lightboxPhoto.description}</p>
				{/if}
				<div class="flex items-center justify-between gap-4">
					<p class="font-sans text-xs text-white/50">
						{lightboxPhoto.filename} · {formatSize(lightboxPhoto.size)}
					</p>
					<div class="flex gap-2">
						<button
							onclick={() => copyMarkdown(lightboxPhoto!)}
							class="rounded-lg bg-white/10 px-3 py-1.5 font-sans text-xs text-white transition-colors hover:bg-white/20"
						>
							Copiar como ![img](url)
						</button>
						{#if lightboxPhoto.uploadedBy === data.currentUserId}
							<button
								onclick={() => deletePhoto(lightboxPhoto!.id)}
								class="rounded-lg bg-red-500/20 px-3 py-1.5 font-sans text-xs text-red-300 transition-colors hover:bg-red-500/30"
							>
								Eliminar
							</button>
						{/if}
					</div>
				</div>
			</div>
		</div>

		<button
			aria-label="Cerrar"
			onclick={() => (lightboxPhoto = null)}
			class="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
		>
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
			</svg>
		</button>
	</div>
{/if}
