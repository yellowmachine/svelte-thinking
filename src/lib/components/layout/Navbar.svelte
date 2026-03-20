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
		<a
			href="/projects"
			class="flex items-center gap-2 font-serif text-xl font-semibold text-ink dark:text-dark-ink"
		>
			Scholio
			<span class="rounded-full border border-accent/40 px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wide text-accent">
				beta
			</span>
		</a>

		<div class="flex items-center gap-4">
			<nav class="hidden items-center gap-4 sm:flex">
				<a href="/projects" class="font-sans text-sm text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink">
					Proyectos
				</a>
				<a href="/bib" class="font-sans text-sm text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink">
					Bibliografía
				</a>
				<a href="/network" class="font-sans text-sm text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink">
					Red
				</a>
				<a href="/help" class="font-sans text-sm text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink">
					Ayuda
				</a>
			</nav>
			<div class="flex items-center gap-2.5">
				<a
					href="/settings"
					title="Ajustes"
					class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent font-sans text-xs font-semibold text-white transition-opacity hover:opacity-80"
				>
					{initials}
				</a>
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
