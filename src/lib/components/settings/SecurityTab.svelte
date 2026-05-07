<script lang="ts">
	import { untrack } from 'svelte';
	import QRCode from 'qrcode';

	let {
		twoFactorEnabled: initialEnabled
	}: {
		twoFactorEnabled: boolean;
	} = $props();

	type TwoFaStep =
		| 'idle'
		| 'enabling'
		| 'qr'
		| 'verifying'
		| 'done'
		| 'disabling'
		| 'view-confirm'
		| 'viewing';

	let twoFaEnabled = $state(untrack(() => initialEnabled));
	let twoFaStep: TwoFaStep = $state('idle');
	let twoFaPassword = $state('');
	let twoFaCode = $state('');
	let twoFaQrDataUrl = $state('');
	let twoFaBackupCodes = $state<string[]>([]);
	let twoFaError = $state('');
	let twoFaLoading = $state(false);
	let twoFaViewCode = $state('');
	let twoFaTextSecret = $state('');

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

	async function handleViewTwoFa() {
		if (twoFaViewCode.length !== 6) return;
		twoFaLoading = true;
		twoFaError = '';
		try {
			const res = await fetch('/api/totp-secret', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code: twoFaViewCode })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.message || 'Código incorrecto');
			}
			const { totpURI, textSecret } = await res.json();
			twoFaQrDataUrl = await QRCode.toDataURL(totpURI);
			twoFaTextSecret = textSecret;
			twoFaViewCode = '';
			twoFaStep = 'viewing';
		} catch (e) {
			twoFaError = e instanceof Error ? e.message : 'Error inesperado';
		} finally {
			twoFaLoading = false;
		}
	}
</script>

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
			{:else if twoFaStep === 'view-confirm'}
				<!-- Verify current TOTP code before revealing the secret -->
				<div class="mt-5 flex flex-col gap-3">
					<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
						Introduce el código de tu app autenticadora actual para ver el código de configuración.
					</p>
					<input
						type="text"
						inputmode="numeric"
						maxlength="6"
						bind:value={twoFaViewCode}
						placeholder="000000"
						class="w-32 rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
					/>
					{#if twoFaError}
						<p class="font-sans text-sm text-red-500">{twoFaError}</p>
					{/if}
					<div class="flex gap-2">
						<button
							type="button"
							onclick={handleViewTwoFa}
							disabled={twoFaViewCode.length !== 6 || twoFaLoading}
							class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
						>
							{twoFaLoading ? 'Verificando...' : 'Verificar'}
						</button>
						<button
							type="button"
							onclick={() => {
								twoFaStep = 'idle';
								twoFaViewCode = '';
								twoFaError = '';
							}}
							class="rounded-md border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
						>
							Cancelar
						</button>
					</div>
				</div>
			{:else if twoFaStep === 'viewing'}
				<!-- Show QR and text secret for adding another device -->
				<div class="mt-5 flex flex-col gap-4">
					<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
						Escanea el código QR con tu nueva app autenticadora, o introduce el código en texto
						manualmente.
					</p>
					{#if twoFaQrDataUrl}
						<img
							src={twoFaQrDataUrl}
							alt="QR code para configurar 2FA"
							class="h-40 w-40 rounded-md"
						/>
					{/if}
					{#if twoFaTextSecret}
						<div class="flex flex-col gap-1">
							<p class="font-sans text-xs font-medium text-ink-muted dark:text-dark-ink-muted">
								Código en texto (para entrada manual):
							</p>
							<div class="flex items-center gap-2">
								<code
									class="rounded bg-paper-ui px-3 py-2 font-mono text-sm tracking-widest text-ink dark:bg-dark-paper-ui dark:text-dark-ink"
								>
									{twoFaTextSecret}
								</code>
								<button
									type="button"
									onclick={() => navigator.clipboard.writeText(twoFaTextSecret)}
									class="rounded border border-paper-border px-2 py-1 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
								>
									Copiar
								</button>
							</div>
						</div>
					{/if}
					<button
						type="button"
						onclick={() => {
							twoFaStep = 'idle';
							twoFaQrDataUrl = '';
							twoFaTextSecret = '';
						}}
						class="self-start rounded-md border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
					>
						Cerrar
					</button>
				</div>
			{:else}
				<div class="mt-5 flex gap-2">
					<button
						type="button"
						onclick={() => {
							twoFaStep = 'view-confirm';
							twoFaError = '';
						}}
						class="rounded-md border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
					>
						Añadir otro dispositivo
					</button>
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
						<img src={twoFaQrDataUrl} alt="QR code to configure 2FA" class="h-44 w-44 rounded" />
					{/if}
				</div>

				{#if twoFaBackupCodes.length > 0}
					<div
						class="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-900/10"
					>
						<div class="mb-3 flex items-start gap-2">
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								class="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
								aria-hidden="true"
							>
								<path
									d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
							<div>
								<p class="font-sans text-xs font-semibold text-amber-700 dark:text-amber-400">
									Save these recovery codes now
								</p>
								<p class="mt-0.5 font-sans text-xs text-amber-600 dark:text-amber-500">
									They will <strong>not</strong> be shown again. Store them somewhere safe.
								</p>
							</div>
						</div>
						<div class="mb-3 grid grid-cols-2 gap-1.5">
							{#each twoFaBackupCodes as code}
								<span
									class="rounded bg-amber-100 px-2 py-1 font-mono text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-300"
									>{code}</span
								>
							{/each}
						</div>
						<div class="flex gap-2">
							<button
								type="button"
								onclick={() => navigator.clipboard.writeText(twoFaBackupCodes.join('\n'))}
								class="inline-flex items-center gap-1.5 rounded border border-amber-300 bg-amber-100 px-3 py-1.5 font-sans text-xs font-medium text-amber-800 transition-colors hover:bg-amber-200 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50"
							>
								<svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
									<rect
										x="9"
										y="9"
										width="13"
										height="13"
										rx="2"
										stroke="currentColor"
										stroke-width="1.5"
									/>
									<path
										d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"
										stroke="currentColor"
										stroke-width="1.5"
									/>
								</svg>
								Copy all
							</button>
							<button
								type="button"
								onclick={() => {
									const blob = new Blob(
										[
											`Scholio 2FA recovery codes\n\n${twoFaBackupCodes.join('\n')}\n\nKeep these codes safe. Each code can only be used once.`
										],
										{ type: 'text/plain' }
									);
									const a = document.createElement('a');
									a.href = URL.createObjectURL(blob);
									a.download = 'scholio-recovery-codes.txt';
									a.click();
									URL.revokeObjectURL(a.href);
								}}
								class="inline-flex items-center gap-1.5 rounded border border-amber-300 bg-amber-100 px-3 py-1.5 font-sans text-xs font-medium text-amber-800 transition-colors hover:bg-amber-200 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50"
							>
								<svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
									<path
										d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"
										stroke="currentColor"
										stroke-width="1.5"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
								Download
							</button>
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
			<div class="mt-5 flex flex-col gap-4">
				<div
					class="rounded-lg border border-green-200 bg-green-50 px-4 py-3 font-sans text-sm text-green-700 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-400"
				>
					2FA enabled successfully. Your account is now protected.
				</div>
				{#if twoFaBackupCodes.length > 0}
					<div
						class="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-900/10"
					>
						<div class="mb-3 flex items-start gap-2">
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								class="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
								aria-hidden="true"
							>
								<path
									d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
							<div>
								<p class="font-sans text-xs font-semibold text-amber-700 dark:text-amber-400">
									Last chance to save your recovery codes
								</p>
								<p class="mt-0.5 font-sans text-xs text-amber-600 dark:text-amber-500">
									These codes will disappear when you leave this page.
								</p>
							</div>
						</div>
						<div class="mb-3 grid grid-cols-2 gap-1.5">
							{#each twoFaBackupCodes as code}
								<span
									class="rounded bg-amber-100 px-2 py-1 font-mono text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-300"
									>{code}</span
								>
							{/each}
						</div>
						<div class="flex gap-2">
							<button
								type="button"
								onclick={() => navigator.clipboard.writeText(twoFaBackupCodes.join('\n'))}
								class="inline-flex items-center gap-1.5 rounded border border-amber-300 bg-amber-100 px-3 py-1.5 font-sans text-xs font-medium text-amber-800 transition-colors hover:bg-amber-200 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50"
							>
								<svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
									<rect
										x="9"
										y="9"
										width="13"
										height="13"
										rx="2"
										stroke="currentColor"
										stroke-width="1.5"
									/>
									<path
										d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"
										stroke="currentColor"
										stroke-width="1.5"
									/>
								</svg>
								Copy all
							</button>
							<button
								type="button"
								onclick={() => {
									const blob = new Blob(
										[
											`Scholio 2FA recovery codes\n\n${twoFaBackupCodes.join('\n')}\n\nKeep these codes safe. Each code can only be used once.`
										],
										{ type: 'text/plain' }
									);
									const a = document.createElement('a');
									a.href = URL.createObjectURL(blob);
									a.download = 'scholio-recovery-codes.txt';
									a.click();
									URL.revokeObjectURL(a.href);
								}}
								class="inline-flex items-center gap-1.5 rounded border border-amber-300 bg-amber-100 px-3 py-1.5 font-sans text-xs font-medium text-amber-800 transition-colors hover:bg-amber-200 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50"
							>
								<svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
									<path
										d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"
										stroke="currentColor"
										stroke-width="1.5"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
								Download
							</button>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</section>
</div>
