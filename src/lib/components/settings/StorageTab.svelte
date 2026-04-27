<script lang="ts">
	import { trpc } from '$lib/utils/trpc';

	type S3Config = {
		endpoint: string;
		bucket: string;
		region: string;
		publicUrl: string | null;
		verified: boolean;
		createdAt: Date;
	};

	let s3Loaded = $state(false);
	let loadingS3 = $state(false);
	let s3Error = $state('');
	let s3Success = $state('');
	let s3Config = $state<S3Config | null>(null);
	let s3Endpoint = $state('');
	let s3Bucket = $state('');
	let s3Region = $state('us-east-1');
	let s3PublicUrl = $state('');
	let s3AccessKey = $state('');
	let s3SecretKey = $state('');
	let s3Saving = $state(false);
	let s3Testing = $state(false);
	let s3Removing = $state(false);

	let internalEnabled = $state(false);
	let internalUsedBytes = $state(0);
	let internalQuotaBytes = $state(50 * 1024 * 1024);
	let togglingInternal = $state(false);

	async function loadS3Config() {
		loadingS3 = true;
		try {
			const [byos3, internal] = await Promise.all([
				trpc.s3Config.get.query(),
				trpc.s3Config.internalUsage.query()
			]);
			s3Config = byos3;
			if (s3Config) {
				s3Endpoint = s3Config.endpoint;
				s3Bucket = s3Config.bucket;
				s3Region = s3Config.region;
				s3PublicUrl = s3Config.publicUrl ?? '';
			}
			internalEnabled = internal.enabled;
			internalUsedBytes = internal.usedBytes;
			internalQuotaBytes = internal.quotaBytes;
			s3Loaded = true;
		} catch {
			s3Error = 'Error loading the S3 configuration.';
		} finally {
			loadingS3 = false;
		}
	}

	async function handleToggleInternal() {
		togglingInternal = true;
		s3Error = '';
		s3Success = '';
		try {
			if (internalEnabled) {
				await trpc.s3Config.disableInternal.mutate();
				internalEnabled = false;
				s3Success = 'Scholio storage disabled.';
			} else {
				await trpc.s3Config.enableInternal.mutate();
				internalEnabled = true;
				s3Success = 'Scholio storage enabled.';
			}
		} catch (e: unknown) {
			s3Error = e instanceof Error ? e.message : 'Error changing storage setting.';
		} finally {
			togglingInternal = false;
		}
	}

	async function handleSaveS3() {
		if (!s3Endpoint.trim() || !s3Bucket.trim() || !s3AccessKey.trim() || !s3SecretKey.trim())
			return;
		s3Saving = true;
		s3Error = '';
		s3Success = '';
		try {
			await trpc.s3Config.set.mutate({
				endpoint: s3Endpoint.trim(),
				bucket: s3Bucket.trim(),
				region: s3Region.trim() || 'us-east-1',
				publicUrl: s3PublicUrl.trim() || undefined,
				accessKey: s3AccessKey,
				secretKey: s3SecretKey
			});
			s3AccessKey = '';
			s3SecretKey = '';
			s3Config = await trpc.s3Config.get.query();
			s3Success = 'Configuration saved. Test the connection to verify it.';
		} catch (e: unknown) {
			s3Error = e instanceof Error ? e.message : 'Error saving the S3 configuration.';
		} finally {
			s3Saving = false;
		}
	}

	async function handleTestS3() {
		s3Testing = true;
		s3Error = '';
		s3Success = '';
		try {
			const result = await trpc.s3Config.test.mutate();
			if (result.ok) {
				s3Success = 'Connection successfully verified.';
				s3Config = await trpc.s3Config.get.query();
			} else {
				s3Error = result.error ?? 'The connection failed. Check the credentials and the bucket.';
			}
		} catch (e: unknown) {
			s3Error = e instanceof Error ? e.message : 'Error testing connection.';
		} finally {
			s3Testing = false;
		}
	}

	async function handleRemoveS3() {
		s3Removing = true;
		s3Error = '';
		s3Success = '';
		try {
			await trpc.s3Config.remove.mutate();
			s3Config = null;
			s3Endpoint = '';
			s3Bucket = '';
			s3Region = 'us-east-1';
			s3PublicUrl = '';
			s3Success = 'Configuration deleted.';
		} catch (e: unknown) {
			s3Error = e instanceof Error ? e.message : 'Error deleting configuration.';
		} finally {
			s3Removing = false;
		}
	}

	$effect(() => {
		if (!s3Loaded && !loadingS3) loadS3Config();
	});
</script>

<div class="flex flex-col gap-6">
	{#if s3Error}
		<div
			class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400"
		>
			{s3Error}
		</div>
	{/if}
	{#if s3Success}
		<div
			class="rounded-lg border border-green-200 bg-green-50 px-4 py-3 font-sans text-sm text-green-700 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-400"
		>
			{s3Success}
		</div>
	{/if}

	{#if loadingS3}
		<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">Loading...</p>
	{:else}
		<!-- Internal storage (beta) -->
		<section
			class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper"
		>
			<div class="flex items-start justify-between gap-4">
				<div class="flex-1">
					<div class="flex items-center gap-2">
						<h2 class="font-serif text-lg font-semibold text-ink dark:text-dark-ink">
							Scholio Storage
						</h2>
						<span
							class="rounded-full bg-accent/10 px-2 py-0.5 font-sans text-xs font-medium text-accent"
							>beta</span
						>
					</div>
					<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
						Use storage hosted on Scholio's servers — no configuration needed.
					</p>
				</div>
				<button
					type="button"
					role="switch"
					aria-label="Toggle Scholio internal storage"
					aria-checked={internalEnabled}
					onclick={handleToggleInternal}
					disabled={togglingInternal}
					class="relative mt-1 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors disabled:opacity-50 {internalEnabled
						? 'bg-accent'
						: 'bg-ink-faint/30 dark:bg-dark-ink-faint/30'}"
				>
					<span
						class="inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform {internalEnabled
							? 'translate-x-5'
							: 'translate-x-0'}"
					></span>
				</button>
			</div>

			<!-- Explanatory callout -->
			<div
				class="mt-4 flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-900/50 dark:bg-amber-950/30"
			>
				<svg
					class="mt-0.5 h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400"
					viewBox="0 0 24 24"
					fill="none"
					aria-hidden="true"
				>
					<path
						d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				<p class="font-sans text-xs leading-relaxed text-amber-800 dark:text-amber-300">
					Scholio provides <strong>50 MB</strong> of shared storage for beta users — enough for
					~20 whiteboard photos. Your files are stored on our servers. For more storage or
					privacy control, configure your own S3 bucket below.
				</p>
			</div>

			<!-- Usage bar (only when enabled) -->
			{#if internalEnabled}
				{@const usedMB = (internalUsedBytes / (1024 * 1024)).toFixed(1)}
				{@const quotaMB = (internalQuotaBytes / (1024 * 1024)).toFixed(0)}
				{@const pct = Math.min(100, (internalUsedBytes / internalQuotaBytes) * 100)}
				<div class="mt-4">
					<div class="mb-1 flex justify-between font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
						<span>{usedMB} MB used</span>
						<span>{quotaMB} MB quota</span>
					</div>
					<div class="h-2 w-full overflow-hidden rounded-full bg-paper-ui dark:bg-dark-paper-ui">
						<div
							class="h-2 rounded-full transition-all {pct >= 90
								? 'bg-red-500'
								: pct >= 70
									? 'bg-amber-500'
									: 'bg-accent'}"
							style="width: {pct}%"
						></div>
					</div>
				</div>
			{/if}
		</section>

		<!-- BYOS3 -->
		<section
			class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper"
		>
			<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">
				Your own S3 bucket
			</h2>
			<p class="mb-5 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				Connect your own S3 bucket (AWS, Cloudflare R2, Backblaze B2, MinIO, etc.) to upload
				photos and datasets. Without configuration, file uploads are disabled.
			</p>

			<!-- Privacy notice -->
			<div
				class="mb-5 flex gap-2.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 dark:border-blue-900/50 dark:bg-blue-950/30"
			>
				<svg
					class="mt-0.5 h-4 w-4 shrink-0 text-blue-500 dark:text-blue-400"
					viewBox="0 0 24 24"
					fill="none"
					aria-hidden="true"
				>
					<path
						d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linejoin="round"
					/>
				</svg>
				<p class="font-sans text-xs leading-relaxed text-blue-800 dark:text-blue-300">
					Credentials are encrypted before being stored. Scholio does not access
					your bucket except to upload or delete files that you manage yourself.
				</p>
			</div>

			<!-- Current config status -->
			{#if s3Config}
				<div
					class="mb-5 flex items-center justify-between gap-3 rounded-lg border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
				>
					<div class="min-w-0 flex-1">
						<p class="truncate font-sans text-sm font-medium text-ink dark:text-dark-ink">
							{s3Config.bucket}
							<span class="font-normal text-ink-faint dark:text-dark-ink-faint"
								>@ {s3Config.endpoint}</span
							>
						</p>
						<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
							{s3Config.verified ? 'Verified' : 'Not verified'} · Región: {s3Config.region}
						</p>
					</div>
					<div class="flex items-center gap-3">
						<span
							class="font-sans text-xs {s3Config.verified
								? 'text-green-600 dark:text-green-400'
								: 'text-amber-600 dark:text-amber-400'}"
						>
							{s3Config.verified ? '✓ OK' : '⚠ Sin verificar'}
						</span>
						<button
							type="button"
							onclick={handleTestS3}
							disabled={s3Testing}
							class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-ui disabled:opacity-50 dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
						>
							{s3Testing ? 'Testing...' : 'Test connection'}
						</button>
						<button
							type="button"
							onclick={handleRemoveS3}
							disabled={s3Removing}
							class="font-sans text-xs text-red-500 transition-colors hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
						>
							Delete
						</button>
					</div>
				</div>
			{/if}

			<!-- Form -->
			<div class="flex flex-col gap-3">
				<p class="font-sans text-sm font-medium text-ink dark:text-dark-ink">
					{s3Config ? 'Update configuration' : 'Configure bucket'}
				</p>
				<div class="grid grid-cols-2 gap-3">
					<input
						type="url"
						bind:value={s3Endpoint}
						placeholder="https://s3.amazonaws.com"
						class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
					/>
					<input
						type="text"
						bind:value={s3Bucket}
						placeholder="nombre-del-bucket"
						class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
					/>
					<input
						type="text"
						bind:value={s3Region}
						placeholder="us-east-1"
						class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
					/>
					<input
						type="url"
						bind:value={s3PublicUrl}
						placeholder="https://cdn.example.com (opcional)"
						class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
					/>
				</div>
				<input
					type="text"
					bind:value={s3AccessKey}
					placeholder="Access Key ID"
					autocomplete="off"
					class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-mono text-sm text-ink placeholder:font-sans placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
				/>
				<div class="flex gap-3">
					<input
						type="password"
						bind:value={s3SecretKey}
						placeholder="Secret Access Key"
						autocomplete="off"
						class="flex-1 rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-mono text-sm text-ink placeholder:font-sans placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
					/>
					<button
						type="button"
						onclick={handleSaveS3}
						disabled={!s3Endpoint.trim() ||
							!s3Bucket.trim() ||
							!s3AccessKey.trim() ||
							!s3SecretKey.trim() ||
							s3Saving}
						class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
					>
						{s3Saving ? 'Saving...' : 'Save'}
					</button>
				</div>
			</div>
		</section>
	{/if}
</div>
