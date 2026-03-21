<script lang="ts">
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Acceso pendiente — Scholio</title>
</svelte:head>

<main class="flex min-h-screen items-center justify-center bg-paper px-6 dark:bg-dark-paper">
	<div class="w-full max-w-md">
		<a href="/" class="mb-8 block font-serif text-2xl font-semibold text-ink dark:text-dark-ink">
			Scholio
		</a>

		{#if form?.ok}
			<div class="rounded-xl border border-paper-border bg-white p-8 dark:border-dark-paper-border dark:bg-dark-paper">
				<h1 class="mb-3 font-serif text-xl font-semibold text-ink dark:text-dark-ink">
					Solicitud enviada
				</h1>
				<p class="font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
					Te avisaremos en cuanto tu acceso a la plataforma de escritura académica esté listo.
				</p>
			</div>
		{:else}
			<div class="rounded-xl border border-paper-border bg-white p-8 dark:border-dark-paper-border dark:bg-dark-paper">
				<h1 class="mb-2 font-serif text-xl font-semibold text-ink dark:text-dark-ink">
					Tu cuenta no tiene acceso a Scholio todavía
				</h1>
				<p class="mb-6 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
					Scholio está en beta cerrada. Si quieres acceder a la plataforma de escritura académica, solicita tu plaza y te avisaremos cuando esté lista.
				</p>

				{#if form?.message}
					<p class="mb-4 rounded-lg bg-accent/10 px-4 py-3 font-sans text-sm text-accent">
						{form.message}
					</p>
				{/if}

				<form method="post" action="?/joinWaitlist" class="space-y-4">
					<div>
						<label for="name" class="mb-1 block font-sans text-sm font-medium text-ink dark:text-dark-ink">
							Nombre
						</label>
						<input
							id="name"
							name="name"
							type="text"
							class="w-full rounded-md border border-paper-border bg-paper px-3 py-2 font-sans text-sm text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
						/>
					</div>
					<div>
						<label for="email" class="mb-1 block font-sans text-sm font-medium text-ink dark:text-dark-ink">
							Email
						</label>
						<input
							id="email"
							name="email"
							type="email"
							value={data.email ?? ''}
							required
							class="w-full rounded-md border border-paper-border bg-paper px-3 py-2 font-sans text-sm text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
						/>
					</div>
					<button
						type="submit"
						class="w-full rounded-md bg-accent px-4 py-2.5 font-sans text-sm font-semibold text-white transition-opacity hover:opacity-90"
					>
						Solicitar acceso
					</button>
				</form>
			</div>

			<form method="post" action="/logout" class="mt-4 text-center">
				<button type="submit" class="font-sans text-sm text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink">
					Cerrar sesión
				</button>
			</form>
		{/if}
	</div>
</main>
