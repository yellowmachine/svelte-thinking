<script lang="ts">
	import type { PageData } from './$types';
	import { trpc } from '$lib/utils/trpc';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import QRCode from 'qrcode';
	import ThemePicker from '$lib/components/layout/ThemePicker.svelte';
	import OrgSettings from '$lib/components/projects/OrgSettings.svelte';
	import { MODEL_RECOMMENDATIONS } from '$lib/ai-config';

	let { data }: { data: PageData } = $props();

	// Profile form state
	let name = $state(data.user.name);
	let email = $state(data.user.email);
	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');

	// Active section — initialise from ?tab= query param if present
	const VALID_TABS = ['profile', 'ai', 'security', 'appearance', 'organizations', 'storage'] as const;
	type Tab = typeof VALID_TABS[number];
	const initialTab = $page.url.searchParams.get('tab');
	let activeTab: Tab = $state(
		VALID_TABS.includes(initialTab as Tab) ? (initialTab as Tab) : 'profile'
	);

	function formatDate(d: Date | null): string {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' });
	}

	// ── AI config state ──────────────────────────────────────────────────────
	type AiKey = { id: string; name: string; enabled: boolean; createdAt: Date; updatedAt: Date };
	type TaskConfig = { keyId: string; model: string };
	type AiTaskId = 'agent' | 'draft' | 'review' | 'requirements';
	type AiTaskDef = { id: AiTaskId; label: string; description: string };
	type AiModel = { id: string; label: string; toolCalling: boolean; pricing: string | null };

	const TASK_LABELS: Record<AiTaskId, string> = {
		agent: 'Agent (chat)',
		draft: 'Draft',
		review: 'Review',
		requirements: 'Requirements'
	};

	let aiKeys = $state<AiKey[]>([]);
	let aiTaskConfig = $state<Partial<Record<AiTaskId, TaskConfig>>>({});
	let aiModels = $state<AiModel[]>([]);
	let aiTasks = $state<AiTaskDef[]>([]);
	let loadingAi = $state(false);
	let aiLoaded = $state(false);
	let aiError = $state('');
	let aiSuccess = $state('');

	// New key form
	let newKeyName = $state('');
	let newKeyValue = $state('');
	let savingNewKey = $state(false);

	// Per-key state
	let togglingKey = $state<Record<string, boolean>>({});
	let deletingKeyId = $state<string | null>(null);

	// Task config saving state
	let savingTask = $state<Record<AiTaskId, boolean>>({
		agent: false,
		draft: false,
		review: false,
		requirements: false
	});

	async function loadAiConfig() {
		loadingAi = true;
		aiError = '';
		try {
			const [keys, taskData, models] = await Promise.all([
				trpc.aiConfig.listKeys.query(),
				trpc.aiConfig.getTaskConfig.query(),
				trpc.aiConfig.getModels.query()
			]);
			aiKeys = keys;
			aiTaskConfig = taskData.taskConfig as Partial<Record<AiTaskId, TaskConfig>>;
			aiModels = models as AiModel[];
			aiTasks = taskData.tasks as AiTaskDef[];
		} catch {
			aiError = 'Could not load assistant configuration.';
		} finally {
			loadingAi = false;
			aiLoaded = true;
		}
	}

	async function handleAddKey() {
		if (!newKeyName.trim() || !newKeyValue.trim()) return;
		savingNewKey = true;
		aiError = '';
		aiSuccess = '';
		try {
			await trpc.aiConfig.addKey.mutate({ name: newKeyName.trim(), apiKey: newKeyValue.trim() });
			newKeyName = '';
			newKeyValue = '';
			aiSuccess = 'API key saved.';
			await loadAiConfig();
		} catch (e: unknown) {
			aiError = e instanceof Error ? e.message : 'Error saving key.';
		} finally {
			savingNewKey = false;
		}
	}

	async function handleToggleKey(keyId: string, enabled: boolean) {
		togglingKey[keyId] = true;
		aiError = '';
		try {
			await trpc.aiConfig.toggleKey.mutate({ keyId, enabled });
			aiKeys = aiKeys.map((k) => (k.id === keyId ? { ...k, enabled } : k));
		} catch (e: unknown) {
			aiError = e instanceof Error ? e.message : 'Error toggling key.';
		} finally {
			togglingKey[keyId] = false;
		}
	}

	async function handleDeleteKey(keyId: string) {
		deletingKeyId = null;
		aiError = '';
		aiSuccess = '';
		try {
			await trpc.aiConfig.deleteKey.mutate({ keyId });
			aiSuccess = 'API key deleted.';
			await loadAiConfig();
		} catch (e: unknown) {
			aiError = e instanceof Error ? e.message : 'Error deleting key.';
		}
	}

	async function handleSetTaskConfig(task: AiTaskId, keyId: string, model: string) {
		if (!keyId || !model) return;
		savingTask[task] = true;
		aiError = '';
		try {
			await trpc.aiConfig.setTaskConfig.mutate({ task, keyId, model });
			aiTaskConfig = { ...aiTaskConfig, [task]: { keyId, model } };
			await invalidateAll();
		} catch (e: unknown) {
			aiError = e instanceof Error ? e.message : 'Error saving task config.';
		} finally {
			savingTask[task] = false;
		}
	}

	async function handleClearTaskConfig(task: AiTaskId) {
		aiError = '';
		try {
			await trpc.aiConfig.clearTaskConfig.mutate({ task });
			const next = { ...aiTaskConfig };
			delete next[task];
			aiTaskConfig = next;
			await invalidateAll();
		} catch (e: unknown) {
			aiError = e instanceof Error ? e.message : 'Error clearing task config.';
		}
	}

	$effect(() => {
		if (activeTab === 'ai' && !aiLoaded && !loadingAi) loadAiConfig();
	});

	// ── 2FA state ─────────────────────────────────────────────────────────────
	type TwoFaStep = 'idle' | 'enabling' | 'qr' | 'verifying' | 'done' | 'disabling';
	let twoFaEnabled = $state(data.user.twoFactorEnabled);
	let twoFaStep: TwoFaStep = $state('idle');
	let twoFaPassword = $state('');
	let twoFaCode = $state('');
	let twoFaQrDataUrl = $state('');
	let twoFaBackupCodes = $state<string[]>([]);
	let twoFaError = $state('');
	let twoFaLoading = $state(false);

	async function handleEnableTwoFa() {
		if (!twoFaPassword.trim()) return;
		twoFaLoading = true;
		twoFaError = '';
		try {
			const res = await fetch('/api/auth/two-factor/enable', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password: twoFaPassword })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.message || 'Error enabling 2FA');
			}
			const { totpURI, backupCodes } = await res.json();
			twoFaQrDataUrl = await QRCode.toDataURL(totpURI);
			twoFaBackupCodes = backupCodes;
			twoFaPassword = '';
			twoFaStep = 'qr';
		} catch (e) {
			twoFaError = e instanceof Error ? e.message : 'Unexpected error';
		} finally {
			twoFaLoading = false;
		}
	}

	async function handleVerifyTwoFa() {
		if (twoFaCode.length !== 6) return;
		twoFaLoading = true;
		twoFaError = '';
		try {
			const res = await fetch('/api/auth/two-factor/verify-totp', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code: twoFaCode })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.message || 'Incorrect code');
			}
			twoFaEnabled = true;
			twoFaStep = 'done';
			twoFaCode = '';
		} catch (e) {
			twoFaError = e instanceof Error ? e.message : 'Incorrect code';
		} finally {
			twoFaLoading = false;
		}
	}

	async function handleDisableTwoFa() {
		if (!twoFaPassword.trim()) return;
		twoFaLoading = true;
		twoFaError = '';
		try {
			const res = await fetch('/api/auth/two-factor/disable', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password: twoFaPassword })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.message || 'Error disabling 2FA');
			}
			twoFaEnabled = false;
			twoFaStep = 'idle';
			twoFaPassword = '';
		} catch (e) {
			twoFaError = e instanceof Error ? e.message : 'Unexpected error';
		} finally {
			twoFaLoading = false;
		}
	}

	// ── Delete key confirmation ───────────────────────────────────────────────
	function confirmDeleteKey(keyId: string) {
		deletingKeyId = keyId;
	}

	async function executeDeleteKey() {
		if (!deletingKeyId) return;
		const keyId = deletingKeyId;
		await handleDeleteKey(keyId);
	}

	// ── S3 config state ──────────────────────────────────────────────────────
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

	async function loadS3Config() {
		loadingS3 = true;
		try {
			s3Config = await trpc.s3Config.get.query();
			if (s3Config) {
				s3Endpoint = s3Config.endpoint;
				s3Bucket = s3Config.bucket;
				s3Region = s3Config.region;
				s3PublicUrl = s3Config.publicUrl ?? '';
			}
			s3Loaded = true;
		} catch {
			s3Error = 'Error cargando la configuración S3.';
		} finally {
			loadingS3 = false;
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
			s3Success = 'Configuración guardada. Prueba la conexión para verificarla.';
		} catch (e: unknown) {
			s3Error = e instanceof Error ? e.message : 'Error guardando la configuración.';
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
				s3Success = 'Conexión verificada correctamente.';
				s3Config = await trpc.s3Config.get.query();
			} else {
				s3Error = result.error ?? 'La conexión falló. Revisa las credenciales y el bucket.';
			}
		} catch (e: unknown) {
			s3Error = e instanceof Error ? e.message : 'Error al probar la conexión.';
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
			s3Success = 'Configuración eliminada.';
		} catch (e: unknown) {
			s3Error = e instanceof Error ? e.message : 'Error eliminando la configuración.';
		} finally {
			s3Removing = false;
		}
	}

	$effect(() => {
		if (activeTab === 'storage' && !s3Loaded && !loadingS3) loadS3Config();
	});

	// ── Delete account ────────────────────────────────────────────────────────
	let showDeleteDialog = $state(false);
	let deleteConfirmText = $state('');
	let deletingAccount = $state(false);
	let deleteError = $state('');
	const DELETE_KEYWORD = 'DELETE';

	async function handleDeleteAccount() {
		if (deleteConfirmText !== DELETE_KEYWORD) return;
		deletingAccount = true;
		deleteError = '';
		try {
			const res = await fetch('/api/account/delete', { method: 'DELETE' });
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.message ?? 'Error deleting account');
			}
			window.location.href = '/?deleted=1';
		} catch (e) {
			deleteError = e instanceof Error ? e.message : 'Unexpected error';
			deletingAccount = false;
		}
	}
</script>

<div class="mx-auto max-w-3xl px-6 py-10">
	<!-- Header -->
	<div class="mb-8">
		<h1 class="font-serif text-3xl font-semibold text-ink dark:text-dark-ink">Settings</h1>
		<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Manage your account and preferences.
		</p>
	</div>

	<!-- Tabs -->
	<div class="mb-8 flex gap-1 border-b border-paper-border dark:border-dark-paper-border">
		<button
			type="button"
			onclick={() => (activeTab = 'profile')}
			class="px-4 pb-3 font-sans text-sm transition-colors {activeTab === 'profile'
				? 'border-b-2 border-accent font-medium text-accent'
				: 'text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink'}"
		>
			Perfil
		</button>
		<button
			type="button"
			onclick={() => (activeTab = 'ai')}
			class="px-4 pb-3 font-sans text-sm transition-colors {activeTab === 'ai'
				? 'border-b-2 border-accent font-medium text-accent'
				: 'text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink'}"
		>
			Asistente IA
		</button>
		<button
			type="button"
			onclick={() => (activeTab = 'security')}
			class="px-4 pb-3 font-sans text-sm transition-colors {activeTab === 'security'
				? 'border-b-2 border-accent font-medium text-accent'
				: 'text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink'}"
		>
			Seguridad
		</button>
		<button
			type="button"
			onclick={() => (activeTab = 'appearance')}
			class="px-4 pb-3 font-sans text-sm transition-colors {activeTab === 'appearance'
				? 'border-b-2 border-accent font-medium text-accent'
				: 'text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink'}"
		>
			Appearance
		</button>
		<button
			type="button"
			onclick={() => (activeTab = 'organizations')}
			class="px-4 pb-3 font-sans text-sm transition-colors {activeTab === 'organizations'
				? 'border-b-2 border-accent font-medium text-accent'
				: 'text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink'}"
		>
			Organizations
		</button>
		<button
			type="button"
			onclick={() => (activeTab = 'storage')}
			class="px-4 pb-3 font-sans text-sm transition-colors {activeTab === 'storage'
				? 'border-b-2 border-accent font-medium text-accent'
				: 'text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink'}"
		>
			Almacenamiento
		</button>
	</div>

	<!-- ── PROFILE TAB ── -->
	{#if activeTab === 'profile'}
		<div class="flex flex-col gap-8">
			<!-- Personal info -->
			<section
				class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper"
			>
				<h2 class="mb-5 font-serif text-lg font-semibold text-ink dark:text-dark-ink">
					Personal information
				</h2>

				<div class="flex flex-col gap-4">
					<!-- Avatar placeholder -->
					<div class="flex items-center gap-4">
						<div
							class="flex h-16 w-16 items-center justify-center rounded-full bg-accent font-serif text-2xl font-semibold text-white"
						>
							{data.user.name
								.split(' ')
								.map((w: string) => w[0])
								.slice(0, 2)
								.join('')
								.toUpperCase()}
						</div>
						<div>
							<button
								type="button"
								disabled
								class="rounded-md border border-paper-border px-3 py-1.5 font-sans text-sm text-ink-muted opacity-50 dark:border-dark-paper-border dark:text-dark-ink-muted"
							>
								Cambiar foto
							</button>
							<p class="mt-1 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
								Coming soon
							</p>
						</div>
					</div>

					<div class="grid gap-4 sm:grid-cols-2">
						<div class="flex flex-col gap-1.5">
							<label for="name" class="font-sans text-sm font-medium text-ink dark:text-dark-ink">
								Nombre
							</label>
							<input
								id="name"
								type="text"
								bind:value={name}
								class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
							/>
						</div>

						<div class="flex flex-col gap-1.5">
							<label for="email" class="font-sans text-sm font-medium text-ink dark:text-dark-ink">
								Email
							</label>
							<input
								id="email"
								type="email"
								bind:value={email}
								class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
							/>
						</div>
					</div>

					<div class="flex justify-end">
						<button
							type="button"
							disabled
							class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white opacity-50"
						>
							Save changes
						</button>
					</div>
				</div>
			</section>

			<!-- Connected accounts -->
			<section
				class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper"
			>
				<h2 class="mb-5 font-serif text-lg font-semibold text-ink dark:text-dark-ink">
					Connected accounts
				</h2>

				<div class="flex items-center justify-between gap-4">
					<div class="flex items-center gap-3">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" class="shrink-0 text-ink dark:text-dark-ink">
							<path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
						</svg>
						<div>
							<p class="font-sans text-sm font-medium text-ink dark:text-dark-ink">GitHub</p>
							{#if data.githubLinked}
								<p class="font-sans text-xs text-green-600 dark:text-green-400">Connected</p>
							{:else}
								<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">Not connected</p>
							{/if}
						</div>
					</div>

					{#if data.githubLinked}
						<span class="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 font-sans text-xs font-medium text-green-700 dark:bg-green-900/20 dark:text-green-400">
							<svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
								<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd"/>
							</svg>
							Linked
						</span>
					{:else}
						<form method="post" action="?/linkGitHub">
							<button
								type="submit"
								class="inline-flex items-center gap-2 rounded-lg border border-paper-border bg-paper-ui px-4 py-2 font-sans text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink dark:hover:border-accent dark:hover:text-accent"
							>
								<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
									<path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
								</svg>
								Connect GitHub
							</button>
						</form>
					{/if}
				</div>
			</section>

			<!-- ORCID -->
			<section
				class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper"
			>
				<div class="mb-4 flex items-start justify-between gap-4">
					<div>
						<h2 class="font-serif text-lg font-semibold text-ink dark:text-dark-ink">ORCID</h2>
						<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
							Connect your ORCID account to verify your academic identity.
						</p>
					</div>
					<svg
						width="32"
						height="32"
						viewBox="0 0 24 24"
						fill="#A6CE39"
						aria-hidden="true"
						class="shrink-0"
					>
						<path
							d="M12 0C5.372 0 0 5.372 0 12s5.372 12 12 12 12-5.372 12-12S18.628 0 12 0zM7.369 4.378c.525 0 .947.431.947.947s-.422.947-.947.947a.95.95 0 0 1-.947-.947c0-.525.422-.947.947-.947zm-.722 3.038h1.444v10.041H6.647V7.416zm3.562 0h3.9c3.712 0 5.344 2.653 5.344 5.025 0 2.578-2.016 5.016-5.325 5.016h-3.919V7.416zm1.444 1.303v7.444h2.297c3.272 0 3.872-2.484 3.872-3.722 0-2.016-1.284-3.722-3.884-3.722h-2.285z"
						/>
					</svg>
				</div>

				{#if data.orcidStatus === 'connected'}
					<p
						class="mb-4 rounded-lg bg-green-50 px-4 py-2 font-sans text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400"
					>
						ORCID connected successfully.
					</p>
				{:else if data.orcidStatus === 'error'}
					<p
						class="mb-4 rounded-lg bg-red-50 px-4 py-2 font-sans text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400"
					>
						Error connecting ORCID. Please try again.
					</p>
				{/if}

				{#if data.orcid && data.orcidVerified}
					<div
						class="flex items-center justify-between gap-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 dark:border-green-800/40 dark:bg-green-900/10"
					>
						<div class="flex items-center gap-2">
							<svg
								width="16"
								height="16"
								viewBox="0 0 20 20"
								fill="currentColor"
								class="shrink-0 text-green-600 dark:text-green-400"
							>
								<path
									fill-rule="evenodd"
									d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
									clip-rule="evenodd"
								/>
							</svg>
							<span class="font-sans text-sm font-medium text-green-700 dark:text-green-400"
								>Verified</span
							>
							<span class="font-mono text-sm text-ink dark:text-dark-ink">{data.orcid}</span>
						</div>
						<a
							href="/api/auth/orcid/connect"
							class="font-sans text-xs text-ink-muted underline hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
						>
							Reconnect
						</a>
					</div>
				{:else}
					{#if data.orcid}
						<p class="mb-3 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
							Current ORCID (unverified): <span class="font-mono">{data.orcid}</span>
						</p>
					{/if}
					<a
						href="/api/auth/orcid/connect"
						class="inline-flex items-center gap-2 rounded-lg border border-paper-border bg-paper-ui px-4 py-2 font-sans text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink dark:hover:border-accent dark:hover:text-accent"
					>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="#A6CE39" aria-hidden="true">
							<path
								d="M12 0C5.372 0 0 5.372 0 12s5.372 12 12 12 12-5.372 12-12S18.628 0 12 0zM7.369 4.378c.525 0 .947.431.947.947s-.422.947-.947.947a.95.95 0 0 1-.947-.947c0-.525.422-.947.947-.947zm-.722 3.038h1.444v10.041H6.647V7.416zm3.562 0h3.9c3.712 0 5.344 2.653 5.344 5.025 0 2.578-2.016 5.016-5.325 5.016h-3.919V7.416zm1.444 1.303v7.444h2.297c3.272 0 3.872-2.484 3.872-3.722 0-2.016-1.284-3.722-3.884-3.722h-2.285z"
							/>
						</svg>
						Connect with ORCID
					</a>
				{/if}
			</section>

			<!-- Change password -->
			<section
				class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper"
			>
				<h2 class="mb-5 font-serif text-lg font-semibold text-ink dark:text-dark-ink">
					Change password
				</h2>

				<div class="flex flex-col gap-4">
					<div class="flex flex-col gap-1.5">
						<label
							for="current-password"
							class="font-sans text-sm font-medium text-ink dark:text-dark-ink"
						>
							Current password
						</label>
						<input
							id="current-password"
							type="password"
							bind:value={currentPassword}
							placeholder="••••••••"
							class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
						/>
					</div>

					<div class="grid gap-4 sm:grid-cols-2">
						<div class="flex flex-col gap-1.5">
							<label
								for="new-password"
								class="font-sans text-sm font-medium text-ink dark:text-dark-ink"
							>
								New password
							</label>
							<input
								id="new-password"
								type="password"
								bind:value={newPassword}
								placeholder="••••••••"
								class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
							/>
						</div>
						<div class="flex flex-col gap-1.5">
							<label
								for="confirm-password"
								class="font-sans text-sm font-medium text-ink dark:text-dark-ink"
							>
								Confirm password
							</label>
							<input
								id="confirm-password"
								type="password"
								bind:value={confirmPassword}
								placeholder="••••••••"
								class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
							/>
						</div>
					</div>

					<div class="flex justify-end">
						<button
							type="button"
							disabled
							class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white opacity-50"
						>
							Update password
						</button>
					</div>
				</div>
			</section>

			<!-- Danger zone -->
			<div
				class="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-900 dark:bg-red-950/30"
			>
				<h2 class="font-serif text-lg font-semibold text-red-700 dark:text-red-400">Danger zone</h2>
				<p class="mt-1 font-sans text-sm text-red-600 dark:text-red-500">
					These actions are permanent and irreversible.
				</p>
				<div
					class="mt-4 flex items-center justify-between rounded-lg border border-red-200 bg-white p-4 dark:border-red-900 dark:bg-dark-paper"
				>
					<div>
						<p class="font-sans text-sm font-medium text-ink dark:text-dark-ink">Delete account</p>
						<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
							Permanently deletes your account, all projects, documents and files.
						</p>
					</div>
					<button
						type="button"
						onclick={() => (showDeleteDialog = true)}
						class="ml-4 shrink-0 rounded-md border border-red-300 px-4 py-2 font-sans text-sm font-medium text-red-700 transition-colors hover:bg-red-100 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30"
					>
						Delete account
					</button>
				</div>
			</div>
		</div>

		<!-- ── AI TAB ── -->
	{:else if activeTab === 'ai'}
		<div class="flex flex-col gap-6">
			{#if aiError}
				<div
					class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400"
				>
					{aiError}
				</div>
			{/if}
			{#if aiSuccess}
				<div
					class="rounded-lg border border-green-200 bg-green-50 px-4 py-3 font-sans text-sm text-green-700 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-400"
				>
					{aiSuccess}
				</div>
			{/if}

			{#if loadingAi}
				<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">Loading...</p>
			{:else}
				<!-- ── Section 1: API Keys ── -->
				<section
					class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper"
				>
					<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">
						API Keys
					</h2>
					<p class="mb-5 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
						Add one or more OpenRouter keys. Each key can be assigned to a specific task below. Get
						your keys at <a
							href="https://openrouter.ai/keys"
							target="_blank"
							rel="noopener noreferrer"
							class="text-accent underline underline-offset-2">openrouter.ai/keys</a
						>.
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
							Your documents are sent to OpenRouter only to process your query. OpenRouter does not
							use API data to train models.
							<a
								href="https://openrouter.ai/privacy"
								target="_blank"
								rel="noopener noreferrer"
								class="font-medium underline underline-offset-2">Privacy Policy →</a
							>
						</p>
					</div>

					<!-- Existing keys -->
					{#if aiKeys.length > 0}
						<div class="mb-5 flex flex-col gap-2">
							{#each aiKeys as key}
								<div
									class="flex items-center justify-between gap-3 rounded-lg border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
								>
									<div class="min-w-0 flex-1">
										<p class="font-sans text-sm font-medium text-ink dark:text-dark-ink">
											{key.name}
										</p>
										<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
											Added {formatDate(key.createdAt)}
										</p>
									</div>
									<div class="flex items-center gap-3">
										<span
											class="font-sans text-xs {key.enabled
												? 'text-green-600 dark:text-green-400'
												: 'text-ink-muted dark:text-dark-ink-muted'}"
										>
											{key.enabled ? 'Active' : 'Inactive'}
										</span>
										<button
											type="button"
											role="switch"
											aria-checked={key.enabled}
											aria-label={`${key.enabled ? 'Disable' : 'Enable'} key ${key.name}`}
											onclick={() => handleToggleKey(key.id, !key.enabled)}
											disabled={togglingKey[key.id]}
											class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50
												{key.enabled ? 'bg-accent' : 'bg-paper-border dark:bg-dark-paper-border'}"
										>
											<span
												class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200
												{key.enabled ? 'translate-x-4' : 'translate-x-0'}"
											></span>
										</button>
										<button
											type="button"
											onclick={() => confirmDeleteKey(key.id)}
											class="font-sans text-xs text-red-500 transition-colors hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
										>
											Delete
										</button>
									</div>
								</div>
							{/each}
						</div>
					{/if}

					<!-- Add new key form -->
					<div class="flex flex-col gap-3">
						<p class="font-sans text-sm font-medium text-ink dark:text-dark-ink">Add key</p>
						<input
							type="text"
							bind:value={newKeyName}
							placeholder="Name (e.g. 'My Anthropic key')"
							class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
						/>
						<div class="flex gap-3">
							<input
								type="password"
								bind:value={newKeyValue}
								placeholder="sk-or-v1-..."
								autocomplete="off"
								class="flex-1 rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-mono text-sm text-ink placeholder:font-sans placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
							/>
							<button
								type="button"
								onclick={handleAddKey}
								disabled={!newKeyName.trim() || !newKeyValue.trim() || savingNewKey}
								class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
							>
								{savingNewKey ? 'Saving...' : 'Save'}
							</button>
						</div>
						<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
							Encrypted with AWS KMS before storage.
						</p>
					</div>
				</section>

				<!-- ── Section 2: Task configuration ── -->
				{#if aiKeys.length > 0}
					<section
						class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper"
					>
						<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">
							Task configuration
						</h2>
						<p class="mb-5 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
							Choose which key and model to use for each AI feature. Falls back to the first active
							key if not configured.
						</p>

						<div class="flex flex-col gap-4">
							{#each aiTasks as task}
								{@const cfg = aiTaskConfig[task.id as AiTaskId]}
								{@const enabledKeys = aiKeys.filter((k) => k.enabled)}
								<div
									class="rounded-lg border border-paper-border bg-paper-ui px-4 py-4 dark:border-dark-paper-border dark:bg-dark-paper-ui"
								>
									<div class="mb-3 flex items-center justify-between">
										<div>
											<p class="font-sans text-sm font-medium text-ink dark:text-dark-ink">
												{task.label}
											</p>
											<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
												{task.description}
											</p>
										</div>
										{#if cfg}
											<button
												type="button"
												onclick={() => handleClearTaskConfig(task.id as AiTaskId)}
												class="font-sans text-xs text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
											>
												Reset
											</button>
										{/if}
									</div>
									<div class="flex gap-3">
										<select
											value={cfg?.keyId ?? ''}
											onchange={async (e) => {
												const keyId = (e.target as HTMLSelectElement).value;
												const model = cfg?.model ?? aiModels[0]?.id ?? '';
												if (keyId) await handleSetTaskConfig(task.id as AiTaskId, keyId, model);
											}}
											class="flex-1 rounded-md border border-paper-border bg-paper px-2 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
										>
											<option value="">— First active key —</option>
											{#each enabledKeys as key}
												<option value={key.id}>{key.name}</option>
											{/each}
										</select>
										<select
											value={cfg?.model ?? ''}
											onchange={async (e) => {
												const model = (e.target as HTMLSelectElement).value;
												const keyId = cfg?.keyId ?? enabledKeys[0]?.id ?? '';
												if (model && keyId)
													await handleSetTaskConfig(task.id as AiTaskId, keyId, model);
											}}
											class="flex-1 rounded-md border border-paper-border bg-paper px-2 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
										>
											<option value="">— Default model —</option>
											{#each task.id === 'agent' ? aiModels.filter((m) => m.toolCalling) : aiModels as m}
												{@const isRec = MODEL_RECOMMENDATIONS[m.id]?.includes(
													task.id as 'agent' | 'draft' | 'review' | 'requirements' | 'lookup'
												)}
												<option value={m.id}
													>{isRec ? '★ ' : ''}{m.label}{m.pricing ? ` — ${m.pricing}` : ''}</option
												>
											{/each}
										</select>
									</div>
									{#if task.id === 'agent' && cfg?.model && !aiModels.find((m) => m.id === cfg.model)?.toolCalling}
										<p class="mt-2 font-sans text-xs text-amber-600 dark:text-amber-400">
											⚠ This model may not support tool calling required by the agent.
										</p>
									{/if}
								</div>
							{/each}
						</div>
					</section>
				{/if}
			{/if}
		</div>

		<!-- ── SECURITY TAB ── -->
	{:else if activeTab === 'security'}
		<div class="flex flex-col gap-6">
			{#if twoFaError}
				<div
					class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400"
				>
					{twoFaError}
				</div>
			{/if}

			<section
				class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper"
			>
				<div class="flex items-start justify-between gap-4">
					<div>
						<h2 class="font-serif text-lg font-semibold text-ink dark:text-dark-ink">
							Two-factor authentication (2FA)
						</h2>
						<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
							Secure your account with an authenticator app like Google Authenticator or Authy.
						</p>
					</div>
					<span
						class="shrink-0 rounded-full px-3 py-1 font-sans text-xs font-semibold {twoFaEnabled
							? 'border border-green-300 text-green-700 dark:border-green-700 dark:text-green-400'
							: 'border border-paper-border text-ink-muted dark:border-dark-paper-border dark:text-dark-ink-muted'}"
					>
						{twoFaEnabled ? 'Enabled' : 'Disabled'}
					</span>
				</div>

				{#if twoFaEnabled}
					<!-- 2FA is active — show disable option -->
					{#if twoFaStep === 'disabling'}
						<div class="mt-5 flex flex-col gap-3">
							<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
								Enter your password to disable two-factor authentication.
							</p>
							<input
								type="password"
								bind:value={twoFaPassword}
								placeholder="Current password"
								autocomplete="current-password"
								class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
							/>
							<div class="flex gap-2">
								<button
									type="button"
									onclick={handleDisableTwoFa}
									disabled={!twoFaPassword.trim() || twoFaLoading}
									class="rounded-md border border-red-300 px-4 py-2 font-sans text-sm text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
								>
									{twoFaLoading ? 'Disabling...' : 'Confirm disable'}
								</button>
								<button
									type="button"
									onclick={() => {
										twoFaStep = 'idle';
										twoFaPassword = '';
										twoFaError = '';
									}}
									class="rounded-md border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
								>
									Cancelar
								</button>
							</div>
						</div>
					{:else}
						<div class="mt-5">
							<button
								type="button"
								onclick={() => {
									twoFaStep = 'disabling';
									twoFaError = '';
								}}
								class="rounded-md border border-red-300 px-4 py-2 font-sans text-sm text-red-600 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
							>
								Desactivar 2FA
							</button>
						</div>
					{/if}
				{:else if twoFaStep === 'idle' || twoFaStep === 'enabling'}
					<!-- Enable step 1: enter password -->
					<div class="mt-5 flex flex-col gap-3">
						{#if twoFaStep === 'idle'}
							<button
								type="button"
								onclick={() => {
									twoFaStep = 'enabling';
									twoFaError = '';
								}}
								class="self-start rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90"
							>
								Activar 2FA
							</button>
						{:else}
							<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
								Enter your password to continue.
							</p>
							<input
								type="password"
								bind:value={twoFaPassword}
								placeholder="Current password"
								autocomplete="current-password"
								class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
							/>
							<div class="flex gap-2">
								<button
									type="button"
									onclick={handleEnableTwoFa}
									disabled={!twoFaPassword.trim() || twoFaLoading}
									class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
								>
									{twoFaLoading ? 'Generating...' : 'Continue'}
								</button>
								<button
									type="button"
									onclick={() => {
										twoFaStep = 'idle';
										twoFaPassword = '';
										twoFaError = '';
									}}
									class="rounded-md border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
								>
									Cancelar
								</button>
							</div>
						{/if}
					</div>
				{:else if twoFaStep === 'qr'}
					<!-- Enable step 2: scan QR and enter code -->
					<div class="mt-5 flex flex-col gap-5">
						<div
							class="flex flex-col items-center gap-3 rounded-lg border border-paper-border bg-paper-ui p-5 dark:border-dark-paper-border dark:bg-dark-paper-ui"
						>
							<p class="font-sans text-sm font-medium text-ink dark:text-dark-ink">
								Scan with your authenticator app
							</p>
							{#if twoFaQrDataUrl}
								<img
									src={twoFaQrDataUrl}
									alt="QR code to configure 2FA"
									class="h-44 w-44 rounded"
								/>
							{/if}
						</div>

						{#if twoFaBackupCodes.length > 0}
							<div
								class="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-900/10"
							>
								<p
									class="mb-2 font-sans text-xs font-semibold tracking-wide text-amber-700 uppercase dark:text-amber-400"
								>
									Backup codes — store them in a safe place
								</p>
								<div class="grid grid-cols-2 gap-1.5">
									{#each twoFaBackupCodes as code}
										<span
											class="rounded bg-amber-100 px-2 py-1 font-mono text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-300"
											>{code}</span
										>
									{/each}
								</div>
							</div>
						{/if}

						<div class="flex flex-col gap-2">
							<label
								for="totp-verify"
								class="font-sans text-sm font-medium text-ink dark:text-dark-ink"
							>
								Enter the 6-digit code to confirm
							</label>
							<div class="flex gap-2">
								<input
									id="totp-verify"
									type="text"
									bind:value={twoFaCode}
									placeholder="000000"
									inputmode="numeric"
									pattern="[0-9]*"
									maxlength="6"
									autocomplete="one-time-code"
									class="w-36 rounded-md border border-paper-border bg-paper-ui px-3 py-2 text-center font-mono text-sm tracking-widest text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
								/>
								<button
									type="button"
									onclick={handleVerifyTwoFa}
									disabled={twoFaCode.length !== 6 || twoFaLoading}
									class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
								>
									{twoFaLoading ? 'Verifying...' : 'Enable'}
								</button>
							</div>
						</div>
					</div>
				{:else if twoFaStep === 'done'}
					<!-- Success state -->
					<div
						class="mt-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 font-sans text-sm text-green-700 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-400"
					>
						2FA enabled successfully. Your account is now protected.
					</div>
				{/if}
			</section>
		</div>

		<!-- ── APPEARANCE TAB ── -->
	{:else if activeTab === 'appearance'}
		<div class="flex flex-col gap-8">
			<section
				class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper"
			>
				<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">Theme</h2>
				<p class="mb-6 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
					Choose a color scheme. Top row is light, bottom row is dark.
				</p>
				<ThemePicker />
			</section>
		</div>

		<!-- ── ORGANIZATIONS TAB ── -->
	{:else if activeTab === 'organizations'}
		<div
			class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper"
		>
			<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">
				Organizations
			</h2>
			<p class="mb-6 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				Create or join organizations to collaborate on projects with a shared AI key.
			</p>
			<OrgSettings initialOrgs={data.orgs ?? []} />
		</div>

		<!-- ── STORAGE TAB ── -->
	{:else if activeTab === 'storage'}
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
				<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">Cargando...</p>
			{:else}
				<section
					class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper"
				>
					<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">
						Almacenamiento S3
					</h2>
					<p class="mb-5 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
						Conecta tu propio bucket S3 (AWS, Cloudflare R2, Backblaze B2, MinIO…) para subir fotos
						y datasets. Sin configuración, la subida de archivos queda deshabilitada.
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
							Las credenciales se cifran con AWS KMS antes de guardarse. Scholio no accede a tu
							bucket salvo para subir o eliminar archivos que tú mismo gestionas.
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
									{s3Config.verified ? 'Verificado' : 'Sin verificar'} · Región: {s3Config.region}
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
									{s3Testing ? 'Probando...' : 'Probar conexión'}
								</button>
								<button
									type="button"
									onclick={handleRemoveS3}
									disabled={s3Removing}
									class="font-sans text-xs text-red-500 transition-colors hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
								>
									Eliminar
								</button>
							</div>
						</div>
					{/if}

					<!-- Form -->
					<div class="flex flex-col gap-3">
						<p class="font-sans text-sm font-medium text-ink dark:text-dark-ink">
							{s3Config ? 'Actualizar configuración' : 'Configurar bucket'}
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
	{/if}
</div>

<!-- Delete API key confirmation dialog -->
{#if deletingKeyId}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
		role="dialog"
		aria-modal="true"
	>
		<div class="w-full max-w-sm rounded-2xl bg-paper p-6 shadow-xl dark:bg-dark-paper">
			<h2 class="font-serif text-lg font-semibold text-ink dark:text-dark-ink">Delete API key?</h2>
			<p class="mt-2 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
				<strong>{aiKeys.find((k) => k.id === deletingKeyId)?.name ?? 'This key'}</strong> will be deleted.
				Any task configured with this key will fall back to the first active key.
			</p>
			<div class="mt-5 flex gap-3">
				<button
					type="button"
					onclick={() => (deletingKeyId = null)}
					class="flex-1 rounded-md border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={executeDeleteKey}
					class="flex-1 rounded-md bg-red-600 px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-red-700"
				>
					Delete
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Delete account confirmation dialog -->
{#if showDeleteDialog}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
		role="dialog"
		aria-modal="true"
		aria-labelledby="delete-dialog-title"
	>
		<div
			class="w-full max-w-md rounded-2xl border border-paper-border bg-paper p-6 shadow-xl dark:border-dark-paper-border dark:bg-dark-paper"
		>
			<h3
				id="delete-dialog-title"
				class="font-serif text-xl font-semibold text-ink dark:text-dark-ink"
			>
				Delete your account?
			</h3>
			<p class="mt-2 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				This action will permanently delete your account and <strong>all your data</strong>:
				projects, documents, version history, comments and files. This cannot be undone.
			</p>

			<div class="mt-5">
				<label
					for="delete-confirm"
					class="block font-sans text-sm font-medium text-ink dark:text-dark-ink"
				>
					Type <span class="font-mono font-bold">{DELETE_KEYWORD}</span> to confirm
				</label>
				<input
					id="delete-confirm"
					type="text"
					bind:value={deleteConfirmText}
					placeholder={DELETE_KEYWORD}
					class="mt-2 w-full rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-faint focus:border-red-400 focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
				/>
			</div>

			{#if deleteError}
				<p class="mt-3 font-sans text-sm text-red-600 dark:text-red-400">{deleteError}</p>
			{/if}

			<div class="mt-5 flex gap-3">
				<button
					type="button"
					onclick={() => {
						showDeleteDialog = false;
						deleteConfirmText = '';
						deleteError = '';
					}}
					disabled={deletingAccount}
					class="flex-1 rounded-md border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui disabled:opacity-50 dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
				>
					Cancelar
				</button>
				<button
					type="button"
					onclick={handleDeleteAccount}
					disabled={deleteConfirmText !== DELETE_KEYWORD || deletingAccount}
					class="flex-1 rounded-md bg-red-600 px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-40"
				>
					{deletingAccount ? 'Deleting...' : 'Delete forever'}
				</button>
			</div>
		</div>
	</div>
{/if}
