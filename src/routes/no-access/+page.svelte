<script lang="ts">
	import type { PageData, ActionData } from './$types';

	import { resolve } from '$app/paths';
	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Access pending — Scholio</title>
</svelte:head>

<main class="flex min-h-screen items-center justify-center bg-paper px-6 dark:bg-dark-paper">
	<div class="w-full max-w-md">
		<a
			href={resolve('/')}
			class="mb-8 block font-serif text-2xl font-semibold text-ink dark:text-dark-ink"
		>
			Scholio
		</a>

		{#if form?.ok}
			<div
				class="rounded-xl border border-paper-border bg-white p-8 dark:border-dark-paper-border dark:bg-dark-paper"
			>
				<h1 class="mb-3 font-serif text-xl font-semibold text-ink dark:text-dark-ink">
					Request submitted
				</h1>
				<p class="font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
					We will notify you as soon as your access to the academic writing platform is ready.
				</p>
			</div>
		{:else}
			<div
				class="rounded-xl border border-paper-border bg-white p-8 dark:border-dark-paper-border dark:bg-dark-paper"
			>
				<h1 class="mb-2 font-serif text-xl font-semibold text-ink dark:text-dark-ink">
					Your account does not have access to Scholio yet
				</h1>
				<p class="mb-6 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
					Scholio is in closed beta. If you want access to the academic writing platform, request a
					spot and we will notify you when it is ready.
				</p>

				{#if form?.message}
					<p class="mb-4 rounded-lg bg-accent/10 px-4 py-3 font-sans text-sm text-accent">
						{form.message}
					</p>
				{/if}

				<form method="post" action="?/joinWaitlist" class="space-y-4">
					<div>
						<label
							for="name"
							class="mb-1 block font-sans text-sm font-medium text-ink dark:text-dark-ink"
						>
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
						<label
							for="email"
							class="mb-1 block font-sans text-sm font-medium text-ink dark:text-dark-ink"
						>
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
				<button
					type="submit"
					class="font-sans text-sm text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
				>
					Sign out
				</button>
			</form>
		{/if}
	</div>
</main>
