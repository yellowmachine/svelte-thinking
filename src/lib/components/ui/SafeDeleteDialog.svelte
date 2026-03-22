<script lang="ts">
	import { onMount } from 'svelte';

	type Props = {
		open: boolean;
		/** Short description of what is being deleted, e.g. "el documento" or "el proyecto" */
		label: string;
		/** Longer warning shown below the label */
		warning?: string;
		deleting?: boolean;
		onconfirm: () => void;
		oncancel: () => void;
	};

	let { open, label, warning, deleting = false, onconfirm, oncancel }: Props = $props();

	const CHARS = 'abcdefghjkmnpqrstuvwxyz23456789'; // no ambiguous chars (0/O, 1/l/I)
	function genCode() {
		return Array.from({ length: 3 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
	}

	let code = $state(genCode());
	let input = $state('');
	let inputEl = $state<HTMLInputElement | undefined>(undefined);

	const matches = $derived(input === code);

	// Regenerate code and reset input each time the dialog opens
	$effect(() => {
		if (open) {
			code = genCode();
			input = '';
			// Focus after DOM update
			setTimeout(() => inputEl?.focus(), 50);
		}
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') oncancel();
	}

	function handleConfirm() {
		if (!matches || deleting) return;
		onconfirm();
	}
</script>

{#if open}
	<!-- Backdrop -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
		onclick={(e) => { if (e.target === e.currentTarget) oncancel(); }}
	>
		<!-- Dialog -->
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="safe-delete-title"
			onkeydown={handleKeydown}
			class="w-full max-w-sm rounded-xl border border-red-200 bg-paper shadow-xl dark:border-red-900/40 dark:bg-dark-paper"
		>
			<!-- Header -->
			<div class="flex items-start justify-between gap-3 px-5 pt-5">
				<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" class="text-red-600 dark:text-red-400" aria-hidden="true">
						<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				</div>
				<div class="min-w-0 flex-1">
					<h2 id="safe-delete-title" class="font-serif text-base font-semibold text-ink dark:text-dark-ink">
						Eliminar {label}
					</h2>
					{#if warning}
						<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">{warning}</p>
					{/if}
				</div>
				<button
					type="button"
					onclick={oncancel}
					class="shrink-0 text-ink-faint transition-colors hover:text-ink dark:text-dark-ink-faint dark:hover:text-dark-ink"
					aria-label="Cerrar"
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
					</svg>
				</button>
			</div>

			<!-- Code confirmation -->
			<div class="px-5 pb-5 pt-4">
				<p class="mb-3 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
					Para confirmar, escribe estos tres caracteres:
				</p>
				<div class="mb-3 flex justify-center gap-3">
					{#each code.split('') as char}
						<span class="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-red-300 bg-red-50 font-mono text-xl font-bold tracking-widest text-red-700 dark:border-red-700/50 dark:bg-red-900/20 dark:text-red-300">
							{char}
						</span>
					{/each}
				</div>
				<input
					bind:this={inputEl}
					bind:value={input}
					type="text"
					maxlength="3"
					autocomplete="off"
					autocorrect="off"
					spellcheck="false"
					onkeydown={(e) => e.key === 'Enter' && handleConfirm()}
					placeholder="···"
					class="w-full rounded-lg border px-3 py-2 text-center font-mono text-lg tracking-widest transition-colors focus:outline-none
						{matches
							? 'border-red-400 bg-red-50 text-red-700 dark:border-red-600 dark:bg-red-900/20 dark:text-red-300'
							: 'border-paper-border bg-paper-ui text-ink dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink'}"
				/>

				<div class="mt-4 flex gap-3">
					<button
						type="button"
						onclick={oncancel}
						disabled={deleting}
						class="flex-1 rounded-lg border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui disabled:opacity-50 dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui"
					>
						Cancelar
					</button>
					<button
						type="button"
						onclick={handleConfirm}
						disabled={!matches || deleting}
						class="flex-1 rounded-lg bg-red-600 px-4 py-2 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
					>
						{deleting ? 'Eliminando…' : 'Eliminar'}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
