<script>
	import { resolve } from '$app/paths';
	let { children } = $props();
</script>

<header
	class="sticky top-0 z-20 border-b border-paper-border bg-paper-ui/90 backdrop-blur-sm dark:border-dark-paper-border dark:bg-dark-paper-ui/90"
>
	<div class="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
		<a href={resolve('/')} class="flex items-center gap-2">
			<div class="flex h-7 w-7 items-center justify-center rounded bg-accent">
				<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
					<path d="M2 3h10M2 7h7M2 11h5" stroke="white" stroke-width="1.5" stroke-linecap="round" />
				</svg>
			</div>
			<span class="font-serif text-base font-semibold text-ink dark:text-dark-ink">Scholio</span>
			<span
				class="rounded-full bg-accent/10 px-2 py-0.5 font-sans text-[10px] font-semibold tracking-wide text-accent uppercase"
				>beta</span
			>
		</a>
		<div class="flex items-center gap-4">
			<a
				href={resolve('/about')}
				class="font-sans text-sm text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
			>
				About
			</a>
			<a
				href={resolve('/login')}
				class="font-sans text-sm text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
			>
				Sign in
			</a>
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<a
				href={resolve('/') + '#waitlist'}
				class="rounded-lg bg-accent px-4 py-1.5 font-sans text-sm font-semibold text-white transition-opacity hover:opacity-90"
			>
				Beta access
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		</div>
	</div>
</header>

<div class="min-h-screen bg-paper-ui dark:bg-dark-paper-ui">
	{@render children()}
</div>

<footer class="border-t border-paper-border px-6 py-3 dark:border-dark-paper-border">
	<p class="text-center font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
		Scholio Beta · Developed with
		<a
			href="https://claude.ai/code"
			target="_blank"
			rel="noopener noreferrer"
			class="underline decoration-dotted hover:text-ink-muted dark:hover:text-dark-ink-muted"
			>Claude Code</a
		>
		· AI assistant powered by
		<span class="font-medium">Claude Haiku 4.5</span> (Anthropic)
	</p>
</footer>
