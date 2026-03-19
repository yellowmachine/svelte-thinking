<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<div class="rounded-2xl border border-paper-border bg-paper p-8 dark:border-dark-paper-border dark:bg-dark-paper">
	<h2 class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">Crear cuenta</h2>
	<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
		¿Ya tienes cuenta?
		<button
			onclick={() => (window.location.href = '/login')}
			class="text-accent hover:underline"
		>Inicia sesión</button>
	</p>

	<form method="post" action="?/signUpEmail" use:enhance class="mt-6 flex flex-col gap-4">
		<div class="flex flex-col gap-1.5">
			<label for="name" class="font-sans text-sm font-medium text-ink dark:text-dark-ink">Nombre completo</label>
			<input
				id="name"
				type="text"
				name="name"
				required
				autocomplete="name"
				class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
			/>
		</div>

		<div class="flex flex-col gap-1.5">
			<label for="email" class="font-sans text-sm font-medium text-ink dark:text-dark-ink">Email</label>
			<input
				id="email"
				type="email"
				name="email"
				required
				autocomplete="email"
				class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
			/>
		</div>

		<div class="flex flex-col gap-1.5">
			<label for="password" class="font-sans text-sm font-medium text-ink dark:text-dark-ink">Contraseña</label>
			<input
				id="password"
				type="password"
				name="password"
				required
				autocomplete="new-password"
				minlength={8}
				class="rounded-md border border-paper-border bg-paper-ui px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
			/>
		</div>

		{#if form?.message}
			<p class="rounded-lg bg-red-50 px-4 py-3 font-sans text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
				{form.message}
			</p>
		{/if}

		<button
			type="submit"
			class="mt-1 rounded-md bg-accent px-4 py-2.5 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover"
		>
			Crear cuenta
		</button>
	</form>

	<div class="relative my-6 flex items-center">
		<div class="flex-1 border-t border-paper-border dark:border-dark-paper-border"></div>
		<span class="mx-3 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">o regístrate con</span>
		<div class="flex-1 border-t border-paper-border dark:border-dark-paper-border"></div>
	</div>

	<form method="post" action="?/signInSocial" use:enhance>
		<input type="hidden" name="provider" value="github" />
		<button
			type="submit"
			class="flex w-full items-center justify-center gap-2.5 rounded-md border border-paper-border bg-paper px-4 py-2.5 font-sans text-sm font-medium text-ink transition-colors hover:bg-paper-ui dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink dark:hover:bg-dark-paper-ui"
		>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
				<path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
			</svg>
			Continuar con GitHub
		</button>
	</form>
</div>
