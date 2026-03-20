<script lang="ts">
	import { trpc } from '$lib/utils/trpc';

	let open = $state(false);
	let message = $state('');
	let showName = $state(false);
	let submitting = $state(false);
	let done = $state(false);
	let error = $state('');

	async function submit() {
		if (!message.trim()) return;
		submitting = true;
		error = '';
		try {
			await trpc.feedback.submit.mutate({ message: message.trim(), showName });
			done = true;
			message = '';
			showName = false;
			setTimeout(() => { open = false; done = false; }, 2000);
		} catch {
			error = 'Error al enviar. Inténtalo de nuevo.';
		} finally {
			submitting = false;
		}
	}

	function close() {
		open = false;
		done = false;
		error = '';
	}
</script>

<!-- Floating button -->
<button
	onclick={() => (open = true)}
	class="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-accent px-4 py-2.5 font-sans text-sm font-medium text-white shadow-lg transition-all hover:bg-accent-hover hover:shadow-xl"
	aria-label="Enviar sugerencia"
>
	<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
		<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
	</svg>
	Sugerencia
</button>

<!-- Modal -->
{#if open}
	<div class="fixed inset-0 z-50 flex items-end justify-end p-6 sm:items-center sm:justify-center">
		<!-- Backdrop -->
		<button class="absolute inset-0 bg-black/30 backdrop-blur-sm" onclick={close} aria-label="Cerrar"></button>

		<div class="relative w-full max-w-md rounded-2xl border border-paper-border bg-paper shadow-2xl dark:border-dark-paper-border dark:bg-dark-paper">
			<div class="flex items-center justify-between border-b border-paper-border px-5 py-4 dark:border-dark-paper-border">
				<div>
					<h2 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">Deja una sugerencia</h2>
					<p class="mt-0.5 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">Estamos en beta — tu opinión construye Scholio.</p>
				</div>
				<button onclick={close} class="rounded-md p-1 text-ink-muted hover:bg-paper-ui dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui" aria-label="Cerrar">
					<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
						<path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
					</svg>
				</button>
			</div>

			<div class="p-5">
				{#if done}
					<div class="flex flex-col items-center gap-2 py-6 text-center">
						<svg width="32" height="32" viewBox="0 0 24 24" fill="none" class="text-green-500" aria-hidden="true">
							<path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						<p class="font-serif text-base font-medium text-ink dark:text-dark-ink">¡Gracias!</p>
						<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">Tu sugerencia ha sido publicada.</p>
					</div>
				{:else}
					<textarea
						bind:value={message}
						rows="4"
						placeholder="¿Qué mejorarías? ¿Qué echas en falta? ¿Algo que no funciona bien?"
						class="w-full resize-none rounded-lg border border-paper-border bg-paper-ui px-3 py-2.5 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
					></textarea>

					<div class="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/40 dark:bg-amber-950/20">
						<p class="font-sans text-xs text-amber-700 dark:text-amber-400">
							Las sugerencias son públicas y visibles en <a href="/feedback" class="underline hover:no-underline">/feedback</a>.
						</p>
					</div>

					<label class="mt-3 flex cursor-pointer items-center gap-2.5">
						<input type="checkbox" bind:checked={showName} class="h-4 w-4 rounded border-paper-border accent-accent" />
						<span class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">Mostrar mi nombre junto a la sugerencia</span>
					</label>

					{#if error}
						<p class="mt-2 font-sans text-sm text-red-600 dark:text-red-400">{error}</p>
					{/if}

					<div class="mt-4 flex justify-end gap-2">
						<button onclick={close} class="rounded-md border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:text-dark-ink-muted">
							Cancelar
						</button>
						<button
							onclick={submit}
							disabled={submitting || !message.trim()}
							class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
						>
							{submitting ? 'Enviando…' : 'Enviar'}
						</button>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
