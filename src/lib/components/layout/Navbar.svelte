<script lang="ts">
	let {
		user
	}: {
		user: { name: string; email: string };
	} = $props();

	const initials = $derived(
		user.name
			.split(' ')
			.map((w) => w[0])
			.slice(0, 2)
			.join('')
			.toUpperCase()
	);
</script>

<nav
	class="sticky top-0 z-10 border-b border-paper-border bg-paper/95 backdrop-blur-sm dark:border-dark-paper-border dark:bg-dark-paper/95"
>
	<div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
		<button
			onclick={() => (window.location.href = '/projects')}
			class="font-serif text-xl font-semibold text-ink dark:text-dark-ink"
		>
			Scholarly
		</button>

		<div class="flex items-center gap-4">
			<div class="flex items-center gap-2.5">
				<div
					class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent font-sans text-xs font-semibold text-white"
				>
					{initials}
				</div>
				<div class="hidden sm:block">
					<p class="font-sans text-sm font-medium text-ink dark:text-dark-ink">{user.name}</p>
					<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">{user.email}</p>
				</div>
			</div>

			<form method="post" action="/logout">
				<button
					type="submit"
					class="rounded-md px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui hover:text-ink dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui dark:hover:text-dark-ink"
				>
					Salir
				</button>
			</form>
		</div>
	</div>
</nav>
