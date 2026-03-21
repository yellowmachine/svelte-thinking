<script lang="ts">
	type Props = {
		status?: number;
	};

	let { status = 404 }: Props = $props();

	const message = $derived(
		status === 404
			? 'Esta página no existe o fue movida.'
			: status === 403
				? 'No tienes permiso para ver esto.'
				: 'Algo salió mal. Intenta de nuevo.'
	);
</script>

<div
	class="flex min-h-screen flex-col items-center justify-center bg-paper-ui px-6 dark:bg-dark-paper-ui"
>
	<div class="flex flex-col items-center gap-8 text-center">

		<!-- Folio perdido -->
		<svg width="96" height="116" viewBox="0 0 96 116" fill="none" aria-hidden="true">
			<!-- Sombra -->
			<rect x="10" y="12" width="76" height="96" rx="3" fill="#e8e2da" opacity="0.6" />
			<!-- Hoja -->
			<rect
				x="6"
				y="8"
				width="76"
				height="96"
				rx="3"
				fill="#f9f7f4"
				stroke="#e8e2da"
				stroke-width="1.5"
			/>
			<!-- Esquina doblada -->
			<path
				d="M58 8 L82 32 L58 32 Z"
				fill="#f0ede8"
				stroke="#e8e2da"
				stroke-width="1"
				stroke-linejoin="round"
			/>
			<!-- Líneas de texto — se desvanecen -->
			<line x1="18" y1="46" x2="66" y2="46" stroke="#e8e2da" stroke-width="2" stroke-linecap="round" />
			<line x1="18" y1="56" x2="72" y2="56" stroke="#e8e2da" stroke-width="2" stroke-linecap="round" />
			<line x1="18" y1="66" x2="54" y2="66" stroke="#e8e2da" stroke-width="2" stroke-linecap="round" />
			<!-- ? en accent -->
			<text
				x="44"
				y="95"
				text-anchor="middle"
				font-family="Source Serif 4, Georgia, serif"
				font-size="28"
				font-weight="600"
				fill="#7c5c3e"
				opacity="0.45"
			>?</text>
		</svg>

		<!-- Código y mensaje -->
		<div>
			<p class="font-sans text-xs font-semibold uppercase tracking-widest text-ink-faint dark:text-dark-ink-faint">
				Error {status}
			</p>
			<p class="mt-2 font-serif text-xl text-ink dark:text-dark-ink">
				{message}
			</p>
		</div>

		<!-- Acción -->
		<a
			href="/projects"
			class="rounded-md border border-paper-border px-4 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper hover:text-ink dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper dark:hover:text-dark-ink"
		>
			Volver al inicio
		</a>
	</div>
</div>
