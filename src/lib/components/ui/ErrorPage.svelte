<script lang="ts">
	import { resolve } from '$app/paths';
	type Props = {
		status?: number;
		/** The error's own message, shown under the generic one when it adds something. */
		detail?: string;
		/** Inside the app shell (navbar stays): fills the content area, not the screen. */
		embedded?: boolean;
	};

	let { status = 404, detail, embedded = false }: Props = $props();

	const GENERIC = new Set(['Not Found', 'Internal Error', 'Forbidden', 'Unauthorized']);
	const extra = $derived(detail && !GENERIC.has(detail) ? detail : null);

	const message = $derived(
		status === 404
			? 'This page does not exist or has been moved.'
			: status === 403
				? 'You do not have permission to view this.'
				: 'Something went wrong. Please try again.'
	);
</script>

<div
	class="flex flex-col items-center justify-center px-6 {embedded
		? 'min-h-full py-16'
		: 'min-h-screen bg-paper-ui dark:bg-dark-paper-ui'}"
>
	<div class="flex flex-col items-center gap-8 text-center">
		<!-- Folio perdido -->
		<svg width="96" height="116" viewBox="0 0 96 116" fill="none" aria-hidden="true">
			<!-- Sombra -->
			<rect
				x="10"
				y="12"
				width="76"
				height="96"
				rx="3"
				fill="var(--color-paper-border)"
				opacity="0.6"
			/>
			<!-- Hoja -->
			<rect
				x="6"
				y="8"
				width="76"
				height="96"
				rx="3"
				fill="var(--color-paper)"
				stroke="var(--color-paper-border)"
				stroke-width="1.5"
			/>
			<!-- Esquina doblada -->
			<path
				d="M58 8 L82 32 L58 32 Z"
				fill="var(--color-paper-ui)"
				stroke="var(--color-paper-border)"
				stroke-width="1"
				stroke-linejoin="round"
			/>
			<!-- Líneas de texto — se desvanecen -->
			<line
				x1="18"
				y1="46"
				x2="66"
				y2="46"
				stroke="var(--color-paper-border)"
				stroke-width="2"
				stroke-linecap="round"
			/>
			<line
				x1="18"
				y1="56"
				x2="72"
				y2="56"
				stroke="var(--color-paper-border)"
				stroke-width="2"
				stroke-linecap="round"
			/>
			<line
				x1="18"
				y1="66"
				x2="54"
				y2="66"
				stroke="var(--color-paper-border)"
				stroke-width="2"
				stroke-linecap="round"
			/>
			<!-- ? en accent -->
			<text
				x="44"
				y="95"
				text-anchor="middle"
				font-family="Source Serif 4, Georgia, serif"
				font-size="28"
				font-weight="600"
				fill="var(--accent-ink)"
				opacity="0.45">?</text
			>
		</svg>

		<!-- Código y mensaje -->
		<div>
			<p
				class="font-sans text-xs font-semibold tracking-widest text-ink-faint uppercase dark:text-dark-ink-faint"
			>
				Error {status}
			</p>
			<h1 class="mt-2 font-serif text-xl text-ink dark:text-dark-ink">
				{message}
			</h1>
			{#if extra}
				<p class="mt-2 max-w-md font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
					{extra}
				</p>
			{/if}
		</div>

		<!-- Actions -->
		<div class="flex flex-wrap items-center justify-center gap-2">
			{#if status >= 500}
				<button
					type="button"
					onclick={() => location.reload()}
					class="rounded-md bg-accent px-4 py-2 font-sans text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
				>
					Try again
				</button>
			{/if}
			<a
				href={resolve('/projects')}
				class="rounded-md border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper hover:text-ink dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper dark:hover:text-dark-ink"
			>
				Back to projects
			</a>
		</div>
	</div>
</div>
