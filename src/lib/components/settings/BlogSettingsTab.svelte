<script lang="ts">
	import { trpc } from '$lib/utils/trpc';
	import { resolve } from '$app/paths';

	type Post = {
		id: string;
		documentId: string;
		projectId: string;
		versionNumber: number;
		slug: string;
		title: string;
		publishedAt: Date;
	};

	let loading = $state(false);
	let loaded = $state(false);
	let handle = $state<string | null>(null);
	let posts = $state<Post[]>([]);

	let publicDisplayName = $state('');
	let publicBio = $state('');
	let savingPublicProfile = $state(false);
	let publicProfileError = $state('');
	let publicProfileSuccess = $state(false);

	async function savePublicProfile() {
		publicProfileError = '';
		publicProfileSuccess = false;
		savingPublicProfile = true;
		try {
			await trpc.users.updateProfile.mutate({
				displayName: publicDisplayName.trim() || undefined,
				bio: publicBio.trim() || null
			});
			publicProfileSuccess = true;
		} catch (e) {
			publicProfileError = e instanceof Error ? e.message : 'Error al guardar el perfil público.';
		} finally {
			savingPublicProfile = false;
		}
	}

	let handleInput = $state('');
	let checking = $state(false);
	let availability = $state<'available' | 'taken' | 'invalid' | 'reserved' | null>(null);
	let saving = $state(false);
	let error = $state('');
	let unpublishingId = $state<string | null>(null);

	let checkTimer: ReturnType<typeof setTimeout> | undefined;

	const fmt = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' });
	const canEditHandle = $derived(!handle && posts.length === 0);
	const locked = $derived(!!handle && posts.length > 0);

	async function load() {
		loading = true;
		try {
			const data = await trpc.blog.getMine.query();
			handle = data.handle;
			posts = data.posts as Post[];
			publicDisplayName = data.displayName ?? '';
			publicBio = data.bio ?? '';
		} finally {
			loading = false;
			loaded = true;
		}
	}

	function onHandleInput() {
		availability = null;
		clearTimeout(checkTimer);
		const value = handleInput.trim().toLowerCase();
		if (!value) return;
		checkTimer = setTimeout(async () => {
			checking = true;
			try {
				const res = await trpc.blog.checkHandleAvailable.query({ handle: value });
				availability = res.available ? 'available' : (res.reason ?? 'taken');
			} finally {
				checking = false;
			}
		}, 400);
	}

	async function saveHandle() {
		error = '';
		saving = true;
		try {
			const res = await trpc.blog.setHandle.mutate({ handle: handleInput.trim().toLowerCase() });
			handle = res.handle;
			handleInput = '';
			availability = null;
		} catch (e: unknown) {
			error = e instanceof Error ? e.message : 'Error al guardar el handle.';
		} finally {
			saving = false;
		}
	}

	async function unpublish(post: Post) {
		if (!confirm(`¿Despublicar "${post.title}"? La URL pública dejará de funcionar.`)) return;
		unpublishingId = post.id;
		try {
			await trpc.blog.unpublish.mutate({ postId: post.id });
			posts = posts.filter((p) => p.id !== post.id);
		} finally {
			unpublishingId = null;
		}
	}

	$effect(() => {
		if (!loaded && !loading) load();
	});
</script>

<div class="flex flex-col gap-6">
	{#if loading}
		<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">Loading...</p>
	{:else}
		<section
			class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper"
		>
			<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">Tu blog</h2>
			<p class="mb-5 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				Publica versiones committeadas de tus documentos como entradas permanentes e indexables por
				buscadores, bajo tu propio handle.
			</p>

			{#if handle}
				<div
					class="flex items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 dark:border-green-900/40 dark:bg-green-900/20"
				>
					<div>
						<p class="font-sans text-sm font-medium text-green-800 dark:text-green-300">
							@{handle}
						</p>
						<a
							href={resolve('/@[handle]', { handle: handle ?? '' })}
							target="_blank"
							rel="noopener noreferrer"
							class="font-sans text-xs text-green-700 underline dark:text-green-400"
						>
							Ver tu blog →
						</a>
					</div>
				</div>
				{#if locked}
					<p class="mt-2 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
						No puedes cambiar tu handle una vez has publicado — protege las URLs ya publicadas.
					</p>
				{/if}
			{/if}

			{#if canEditHandle}
				<div class="flex flex-col gap-2">
					<label
						for="blog-handle"
						class="font-sans text-sm font-medium text-ink dark:text-dark-ink"
					>
						Elige tu handle
					</label>
					<div class="flex gap-2">
						<div
							class="flex flex-1 items-center rounded-md border border-paper-border bg-paper-ui px-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
						>
							<span class="font-sans text-sm text-ink-faint dark:text-dark-ink-faint">@</span>
							<input
								id="blog-handle"
								type="text"
								bind:value={handleInput}
								oninput={onHandleInput}
								placeholder="tu-nombre"
								class="w-full bg-transparent px-1 py-2 font-sans text-sm text-ink focus:outline-none dark:text-dark-ink"
							/>
						</div>
						<button
							type="button"
							onclick={saveHandle}
							disabled={saving || availability !== 'available'}
							class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
						>
							{saving ? 'Guardando...' : 'Guardar'}
						</button>
					</div>
					{#if checking}
						<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">Comprobando...</p>
					{:else if availability === 'available'}
						<p class="font-sans text-xs text-green-600 dark:text-green-400">Disponible.</p>
					{:else if availability === 'taken'}
						<p class="font-sans text-xs text-red-600 dark:text-red-400">
							Ese handle ya está en uso.
						</p>
					{:else if availability === 'invalid'}
						<p class="font-sans text-xs text-red-600 dark:text-red-400">
							3-30 caracteres: letras, números y guiones.
						</p>
					{:else if availability === 'reserved'}
						<p class="font-sans text-xs text-red-600 dark:text-red-400">
							Ese handle está reservado.
						</p>
					{/if}
					{#if error}
						<p class="font-sans text-xs text-red-600 dark:text-red-400">{error}</p>
					{/if}
				</div>
			{/if}
		</section>

		<section
			class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper"
		>
			<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">
				Perfil público
			</h2>
			<p class="mb-5 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				Se muestra en la portada de tu blog (<code class="font-mono">/@handle</code>).
			</p>

			<div class="flex flex-col gap-4">
				<div class="flex flex-col gap-1.5">
					<label
						for="public-display-name"
						class="font-sans text-sm font-medium text-ink dark:text-dark-ink"
					>
						Nombre público
					</label>
					<input
						id="public-display-name"
						type="text"
						maxlength="100"
						bind:value={publicDisplayName}
						class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
					/>
				</div>

				<div class="flex flex-col gap-1.5">
					<label for="public-bio" class="font-sans text-sm font-medium text-ink dark:text-dark-ink">
						Bio
					</label>
					<textarea
						id="public-bio"
						rows="3"
						maxlength="500"
						bind:value={publicBio}
						placeholder="Una breve descripción sobre ti…"
						class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
					></textarea>
				</div>

				{#if publicProfileError}
					<p class="font-sans text-sm text-red-600 dark:text-red-400">{publicProfileError}</p>
				{/if}
				{#if publicProfileSuccess}
					<p class="font-sans text-sm text-green-600 dark:text-green-400">
						Perfil público actualizado.
					</p>
				{/if}

				<div class="flex justify-end">
					<button
						type="button"
						onclick={savePublicProfile}
						disabled={savingPublicProfile}
						class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
					>
						{savingPublicProfile ? 'Guardando…' : 'Save changes'}
					</button>
				</div>
			</div>
		</section>

		{#if handle}
			<section
				class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper"
			>
				<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">
					Publicaciones
				</h2>
				<p class="mb-5 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
					Se publican desde el historial de versiones de cada documento.
				</p>

				{#if posts.length === 0}
					<p class="font-sans text-sm text-ink-faint dark:text-dark-ink-faint">
						Todavía no has publicado nada.
					</p>
				{:else}
					<div class="flex flex-col gap-2">
						{#each posts as post (post.id)}
							<div
								class="flex items-center justify-between gap-3 rounded-lg border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
							>
								<div class="min-w-0 flex-1">
									<a
										href={resolve('/@[handle]/[slug]', { handle: handle ?? '', slug: post.slug })}
										target="_blank"
										rel="noopener noreferrer"
										class="truncate font-sans text-sm font-medium text-ink hover:underline dark:text-dark-ink"
									>
										{post.title}
									</a>
									<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
										{fmt.format(new Date(post.publishedAt))} · originado en
										<a
											href={resolve(
												`/projects/${post.projectId}/documents/${post.documentId}/history`
											)}
											class="underline decoration-dotted hover:text-ink-muted dark:hover:text-dark-ink-muted"
										>
											v{post.versionNumber}
										</a>
									</p>
								</div>
								<button
									type="button"
									onclick={() => unpublish(post)}
									disabled={unpublishingId === post.id}
									class="shrink-0 font-sans text-xs text-red-500 transition-colors hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
								>
									{unpublishingId === post.id ? 'Despublicando...' : 'Despublicar'}
								</button>
							</div>
						{/each}
					</div>
				{/if}
			</section>
		{/if}
	{/if}
</div>
