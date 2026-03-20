<script lang="ts">
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<div class="flex min-h-screen flex-col bg-paper-ui dark:bg-dark-paper-ui">

	<!-- Nav -->
	<header class="flex items-center justify-between border-b border-paper-border px-8 py-4 dark:border-dark-paper-border">
		<div class="flex items-center gap-2">
			<div class="flex h-7 w-7 items-center justify-center rounded bg-accent">
				<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
					<path d="M2 3h10M2 7h7M2 11h5" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
				</svg>
			</div>
			<span class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">Scholio</span>
			<span class="rounded-full bg-accent/10 px-2 py-0.5 font-sans text-xs font-semibold text-accent">beta</span>
		</div>
		<a href="/login" class="font-sans text-sm text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink">
			Iniciar sesión
		</a>
	</header>

	<!-- Hero -->
	<main class="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 py-20 text-center">
		<h1 class="font-serif text-5xl font-semibold leading-tight text-ink dark:text-dark-ink">
			Escribe, colabora<br/>e investiga con IA
		</h1>
		<p class="mt-5 font-sans text-lg leading-relaxed text-ink-muted dark:text-dark-ink-muted">
			Scholio es una plataforma de escritura académica colaborativa con control de versiones,
			comentarios inline y un asistente de IA que conoce tu proyecto.
		</p>

		{#if form?.success}
			<div class="mt-10 w-full max-w-md rounded-xl border border-green-200 bg-green-50 px-6 py-8 dark:border-green-900/40 dark:bg-green-900/20">
				<p class="font-serif text-xl font-semibold text-green-800 dark:text-green-300">Solicitud recibida</p>
				<p class="mt-2 font-sans text-sm text-green-700 dark:text-green-400">
					Te avisaremos en <strong>{form.email}</strong> cuando tu acceso esté listo.
				</p>
			</div>
		{:else}
			<form method="POST" action="?/joinWaitlist" class="mt-10 w-full max-w-md">
				<div class="flex flex-col gap-3">
					<input
						type="text"
						name="name"
						placeholder="Tu nombre"
						required
						class="rounded-lg border border-paper-border bg-paper px-4 py-3 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
					/>
					<input
						type="email"
						name="email"
						placeholder="tu@email.com"
						required
						class="rounded-lg border border-paper-border bg-paper px-4 py-3 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
					/>
					<textarea
						name="message"
						placeholder="¿En qué tipo de investigación trabajas? (opcional)"
						rows="3"
						class="resize-none rounded-lg border border-paper-border bg-paper px-4 py-3 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
					></textarea>

					{#if form?.error}
						<p class="font-sans text-sm text-red-600 dark:text-red-400">{form.error}</p>
					{/if}

					<button
						type="submit"
						class="rounded-lg bg-accent px-6 py-3 font-sans text-sm font-semibold text-white transition-opacity hover:opacity-90"
					>
						Solicitar acceso
					</button>
				</div>
			</form>
			<p class="mt-4 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
				Beta cerrada · Te avisamos cuando tu acceso esté listo
			</p>
		{/if}
	</main>

	<footer class="border-t border-paper-border px-8 py-4 dark:border-dark-paper-border">
		<div class="flex flex-col items-center gap-2">
			<p class="text-center font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
				Scholio Beta · Desarrollado con Claude Code · Asistente IA impulsado por Claude Haiku 4.5 (Anthropic)
			</p>
			<a href="/conduct" class="font-sans text-xs text-ink-faint underline underline-offset-2 hover:text-ink-muted dark:text-dark-ink-faint dark:hover:text-dark-ink-muted">
				Código de conducta
			</a>
		</div>
	</footer>
</div>
