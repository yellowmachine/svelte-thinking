<script lang="ts">
	import type { PageData } from './$types';
	import MarkdownPreview from '$lib/components/editor/MarkdownPreview.svelte';
	import favicon from '$lib/assets/favicon.svg';

	let { data }: { data: PageData } = $props();

	const fmt = new Intl.DateTimeFormat('es', {
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	});

	const fmtExpiry = new Intl.DateTimeFormat('es', {
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	});
</script>

<svelte:head>
	<title>{data.document.title} · v{data.version.versionNumber} — Scholio</title>
	<meta
		name="description"
		content="Shared document version on Scholio — collaborative academic writing."
	/>
	<meta name="robots" content="noindex, nofollow" />
	<link rel="icon" href={favicon} />
</svelte:head>

<!-- Navbar -->
<header
	class="sticky top-0 z-20 border-b border-paper-border bg-paper/95 backdrop-blur-sm dark:border-dark-paper-border dark:bg-dark-paper/95"
>
	<div class="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3">
		<!-- Logo + versión badge -->
		<div class="flex items-center gap-3">
			<a href="/" class="flex items-center gap-2 transition-opacity hover:opacity-80">
				<div class="flex h-7 w-7 items-center justify-center rounded bg-accent">
					<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
						<path
							d="M2 3h10M2 7h7M2 11h5"
							stroke="white"
							stroke-width="1.5"
							stroke-linecap="round"
						/>
					</svg>
				</div>
				<span class="font-serif text-base font-semibold text-ink dark:text-dark-ink">Scholio</span>
			</a>
			<span class="hidden h-4 w-px bg-paper-border sm:block dark:bg-dark-paper-border"></span>
			<span class="hidden items-center gap-1.5 sm:flex">
				<span
					class="max-w-[180px] truncate font-sans text-sm text-ink-muted dark:text-dark-ink-muted"
				>
					{data.document.title}
				</span>
				<span
					class="rounded-md bg-accent/10 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-accent"
				>
					v{data.version.versionNumber}
				</span>
			</span>
		</div>

		<!-- CTAs -->
		<div class="flex items-center gap-2">
			<a
				href="/auth/login"
				class="rounded-md px-3 py-1.5 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-ui hover:text-ink dark:text-dark-ink-muted dark:hover:bg-dark-paper-ui dark:hover:text-dark-ink"
			>
				Sign in
			</a>
			<a
				href="/#waitlist"
				class="rounded-md bg-accent px-3 py-1.5 font-sans text-sm font-semibold text-white transition-opacity hover:opacity-90"
			>
				Join beta
			</a>
		</div>
	</div>
</header>

<!-- Document content -->
<main class="mx-auto max-w-2xl px-6 py-12">
	<!-- Document header -->
	<div class="mb-8 border-b border-paper-border pb-6 dark:border-dark-paper-border">
		<h1 class="font-serif text-3xl font-semibold text-ink dark:text-dark-ink">
			{data.document.title}
		</h1>
		{#if data.version.changeDescription}
			<p class="mt-2 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				{data.version.changeDescription}
			</p>
		{/if}
		<div
			class="mt-3 flex flex-wrap items-center gap-3 font-sans text-xs text-ink-faint dark:text-dark-ink-faint"
		>
			<span>Version {data.version.versionNumber}</span>
			<span>·</span>
			<span>{fmt.format(new Date(data.version.createdAt))}</span>
			<span>·</span>
			<span>Expires {fmtExpiry.format(new Date(data.expiresAt))}</span>
		</div>
	</div>

	<MarkdownPreview content={data.version.content} />
</main>

<!-- Footer CTA -->
<footer
	class="mt-16 border-t border-paper-border bg-paper-ui/50 py-12 dark:border-dark-paper-border dark:bg-dark-paper-ui/50"
>
	<div class="mx-auto max-w-2xl px-6 text-center">
		<div class="mb-3 flex items-center justify-center gap-2">
			<div class="flex h-8 w-8 items-center justify-center rounded bg-accent">
				<svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden="true">
					<path d="M2 3h10M2 7h7M2 11h5" stroke="white" stroke-width="1.5" stroke-linecap="round" />
				</svg>
			</div>
			<span class="font-serif text-lg font-semibold text-ink dark:text-dark-ink">Scholio</span>
		</div>
		<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Collaborative academic writing with version control, AI assistance, and smart citations.
		</p>
		<div class="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
			<a
				href="/#waitlist"
				class="rounded-lg bg-accent px-5 py-2 font-sans text-sm font-semibold text-white transition-opacity hover:opacity-90"
			>
				Join the beta
			</a>
			<a
				href="/auth/login"
				class="rounded-lg border border-paper-border px-5 py-2 font-sans text-sm font-medium text-ink-muted transition-colors hover:bg-paper dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper"
			>
				Sign in
			</a>
		</div>
	</div>
</footer>
