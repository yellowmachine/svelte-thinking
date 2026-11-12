<script lang="ts">
	import { trpc } from '$lib/utils/trpc';
	import { resolve } from '$app/paths';

	let loading = $state(false);
	let loaded = $state(false);
	let handle = $state<string | null>(null);
	let hasPosts = $state(false);

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
			publicProfileError = e instanceof Error ? e.message : "Couldn't save the public profile.";
		} finally {
			savingPublicProfile = false;
		}
	}

	let handleInput = $state('');
	let checking = $state(false);
	let availability = $state<'available' | 'taken' | 'invalid' | 'reserved' | null>(null);
	let saving = $state(false);
	let error = $state('');

	let checkTimer: ReturnType<typeof setTimeout> | undefined;

	const canEditHandle = $derived(!handle && !hasPosts);
	const locked = $derived(!!handle && hasPosts);

	async function load() {
		loading = true;
		try {
			const data = await trpc.blog.getMine.query();
			handle = data.handle;
			hasPosts = data.posts.length > 0;
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
			error = e instanceof Error ? e.message : "Couldn't save the handle.";
		} finally {
			saving = false;
		}
	}

	$effect(() => {
		if (!loaded && !loading) load();
	});
</script>

<div class="flex flex-col gap-6">
	{#if loading}
		<p class="font-sans text-sm text-ink-muted">Loading...</p>
	{:else}
		<section class="rounded-xl border border-paper-border bg-paper p-6">
			<h2 class="mb-1 font-serif text-lg font-semibold text-ink">Your blog</h2>
			<p class="mb-5 font-sans text-sm text-ink-muted">
				Publish saved versions of your documents as permanent, search-indexable posts under your own
				handle.
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
							View your blog →
						</a>
					</div>
				</div>
				{#if locked}
					<p class="mt-2 font-sans text-xs text-ink-faint">
						You can't change your handle once you've published — this protects URLs already out
						there.
					</p>
				{/if}
			{/if}

			{#if canEditHandle}
				<div class="flex flex-col gap-2">
					<label for="blog-handle" class="font-sans text-sm font-medium text-ink">
						Choose your handle
					</label>
					<div class="flex gap-2">
						<div
							class="flex flex-1 items-center rounded-md border border-paper-border bg-paper-ui px-3"
						>
							<span class="font-sans text-sm text-ink-faint">@</span>
							<input
								id="blog-handle"
								type="text"
								bind:value={handleInput}
								oninput={onHandleInput}
								placeholder="your-name"
								class="w-full bg-transparent px-1 py-2 font-sans text-sm text-ink focus:outline-none"
							/>
						</div>
						<button
							type="button"
							onclick={saveHandle}
							disabled={saving || availability !== 'available'}
							class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
						>
							{saving ? 'Saving…' : 'Save'}
						</button>
					</div>
					{#if checking}
						<p class="font-sans text-xs text-ink-faint">Checking…</p>
					{:else if availability === 'available'}
						<p class="font-sans text-xs text-green-600 dark:text-green-400">Disponible.</p>
					{:else if availability === 'taken'}
						<p class="font-sans text-xs text-red-600 dark:text-red-400">
							That handle is already taken.
						</p>
					{:else if availability === 'invalid'}
						<p class="font-sans text-xs text-red-600 dark:text-red-400">
							3–30 characters: letters, numbers and hyphens.
						</p>
					{:else if availability === 'reserved'}
						<p class="font-sans text-xs text-red-600 dark:text-red-400">That handle is reserved.</p>
					{/if}
					{#if error}
						<p class="font-sans text-xs text-red-600 dark:text-red-400">{error}</p>
					{/if}
				</div>
			{/if}
		</section>

		<section class="rounded-xl border border-paper-border bg-paper p-6">
			<h2 class="mb-1 font-serif text-lg font-semibold text-ink">Public profile</h2>
			<p class="mb-5 font-sans text-sm text-ink-muted">
				Shown on your blog's home page (<code class="font-mono">/@handle</code>).
			</p>

			<div class="flex flex-col gap-4">
				<div class="flex flex-col gap-1.5">
					<label for="public-display-name" class="font-sans text-sm font-medium text-ink">
						Display name
					</label>
					<input
						id="public-display-name"
						type="text"
						maxlength="100"
						bind:value={publicDisplayName}
						class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink focus:border-accent focus:outline-none"
					/>
				</div>

				<div class="flex flex-col gap-1.5">
					<label for="public-bio" class="font-sans text-sm font-medium text-ink"> Bio </label>
					<textarea
						id="public-bio"
						rows="3"
						maxlength="500"
						bind:value={publicBio}
						placeholder="A short description of yourself…"
						class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink focus:border-accent focus:outline-none"
					></textarea>
				</div>

				{#if publicProfileError}
					<p class="font-sans text-sm text-red-600 dark:text-red-400">{publicProfileError}</p>
				{/if}
				{#if publicProfileSuccess}
					<p class="font-sans text-sm text-green-600 dark:text-green-400">
						Public profile updated.
					</p>
				{/if}

				<div class="flex justify-end">
					<button
						type="button"
						onclick={savePublicProfile}
						disabled={savingPublicProfile}
						class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
					>
						{savingPublicProfile ? 'Saving…' : 'Save changes'}
					</button>
				</div>
			</div>
		</section>

		{#if handle}
			<section class="rounded-xl border border-paper-border bg-paper p-6">
				<h2 class="mb-1 font-serif text-lg font-semibold text-ink">Posts</h2>
				<p class="font-sans text-sm text-ink-muted">
					Manage your posts at <a href={resolve('/posts')} class="underline hover:text-ink"
						>/posts →</a
					>
				</p>
			</section>
		{/if}
	{/if}
</div>
