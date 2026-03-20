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

	let menuOpen = $state(false);

	function toggleMenu() {
		menuOpen = !menuOpen;
	}

	function close() {
		menuOpen = false;
	}
</script>

<header
	class="sticky top-0 z-10 flex items-center justify-between border-b border-paper-border bg-paper/95 px-4 py-3 backdrop-blur-sm sm:hidden dark:border-dark-paper-border dark:bg-dark-paper/95"
>
	<a
		href="/projects"
		class="flex items-center gap-2 font-serif text-lg font-semibold text-ink dark:text-dark-ink"
	>
		Scholio
		<span
			class="rounded-full border border-accent/40 px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wide text-accent"
		>
			beta
		</span>
	</a>

	<div
		class="relative"
		{@attach (node) => {
			function handleClick(e: MouseEvent) {
				if (menuOpen && !node.contains(e.target as Node)) close();
			}
			window.addEventListener('click', handleClick);
			return () => window.removeEventListener('click', handleClick);
		}}
	>
		<button
			onclick={toggleMenu}
			class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent font-sans text-xs font-semibold text-white"
		>
			{initials}
		</button>

		{#if menuOpen}
			<div
				class="absolute right-0 top-full z-50 mt-1.5 w-44 rounded-xl border border-paper-border bg-paper shadow-lg dark:border-dark-paper-border dark:bg-dark-paper"
			>
				<div class="border-b border-paper-border px-4 py-2.5 dark:border-dark-paper-border">
					<p class="font-sans text-sm font-medium text-ink dark:text-dark-ink">{user.name}</p>
					<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">{user.email}</p>
				</div>
				<ul class="py-1">
					<li>
						<a
							href="/settings"
							class="block px-4 py-2 font-sans text-sm text-ink transition-colors hover:bg-paper-ui dark:text-dark-ink dark:hover:bg-dark-paper-ui"
						>
							Ajustes
						</a>
					</li>
					<li>
						<form method="post" action="/logout">
							<button
								type="submit"
								class="w-full px-4 py-2 text-left font-sans text-sm text-ink transition-colors hover:bg-paper-ui dark:text-dark-ink dark:hover:bg-dark-paper-ui"
							>
								Salir
							</button>
						</form>
					</li>
				</ul>
			</div>
		{/if}
	</div>
</header>
