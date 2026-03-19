<script lang="ts">
	let darkMode = $state(false);
	let content = $state(`La escritura académica representa uno de los pilares fundamentales del avance científico. A través de la comunicación precisa y rigurosa de hallazgos, metodologías y conclusiones, los investigadores contribuyen al cuerpo colectivo del conocimiento humano.

Este trabajo examina los mecanismos mediante los cuales la colaboración entre investigadores de distintas disciplinas produce resultados cualitativamente superiores a los obtenidos mediante el trabajo individual. La hipótesis central sostiene que la diversidad epistémica — entendida como la variedad de marcos conceptuales, metodologías y supuestos ontológicos presentes en un equipo — actúa como catalizador de la innovación científica.

La evidencia empírica recolectada durante tres años de observación participante en laboratorios interdisciplinarios de cinco universidades europeas sugiere que los equipos con mayor heterogeneidad disciplinar publican con mayor frecuencia en revistas de alto impacto, obtienen más citas en los cinco años posteriores a la publicación, y generan patentes con mayor regularidad que sus contrapartes homogéneas.`);

	let wordCount = $derived(
		content
			.trim()
			.split(/\s+/)
			.filter((w) => w.length > 0).length
	);

	let readingTime = $derived(Math.ceil(wordCount / 200));

	const documents = [
		{ id: '1', title: 'Introducción' },
		{ id: '2', title: 'Marco Teórico' },
		{ id: '3', title: 'Metodología' },
		{ id: '4', title: 'Resultados' },
		{ id: '5', title: 'Discusión' },
		{ id: '6', title: 'Conclusiones' }
	];

	const toolbarActions = ['B', 'I', 'H1', 'H2', '"', '—'];

	let activeDoc = $state('1');

	function toggleDark() {
		darkMode = !darkMode;
		document.documentElement.classList.toggle('dark', darkMode);
	}
</script>

<div class="flex h-screen overflow-hidden bg-paper-ui dark:bg-dark-paper-ui">
	<!-- Sidebar -->
	<aside
		class="flex w-64 shrink-0 flex-col border-r border-paper-border bg-paper-ui dark:border-dark-paper-border dark:bg-dark-paper-ui"
	>
		<!-- Logo -->
		<div
			class="flex items-center gap-2 border-b border-paper-border px-5 py-4 dark:border-dark-paper-border"
		>
			<div class="flex h-7 w-7 items-center justify-center rounded bg-accent">
				<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
					<path d="M2 3h10M2 7h7M2 11h5" stroke="white" stroke-width="1.5" stroke-linecap="round" />
				</svg>
			</div>
			<span class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">Scholarly</span>
		</div>

		<!-- Project name -->
		<div class="px-5 pb-2 pt-5">
			<p
				class="font-sans text-xs font-medium uppercase tracking-widest text-ink-faint dark:text-dark-ink-faint"
			>
				Proyecto actual
			</p>
			<p class="mt-1 font-sans text-sm font-medium text-ink dark:text-dark-ink">
				Colaboración Interdisciplinar en Ciencia
			</p>
		</div>

		<!-- Document list -->
		<nav class="mt-3 flex-1 overflow-y-auto px-3">
			<p class="mb-1 px-2 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">Secciones</p>
			{#each documents as doc (doc.id)}
				<button
					onclick={() => (activeDoc = doc.id)}
					class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-sans text-sm transition-colors
						{activeDoc === doc.id
						? 'bg-accent-light text-accent dark:bg-accent/20 dark:text-dark-ink'
						: 'text-ink-muted hover:bg-paper-border/50 dark:text-dark-ink-muted dark:hover:bg-dark-paper-border/50'}"
				>
					<svg width="12" height="12" viewBox="0 0 12 12" opacity="0.5">
						<rect
							x="1"
							y="1"
							width="10"
							height="10"
							rx="1"
							fill="none"
							stroke="currentColor"
							stroke-width="1.2"
						/>
						<path
							d="M3 4h6M3 6h6M3 8h4"
							stroke="currentColor"
							stroke-width="1"
							stroke-linecap="round"
						/>
					</svg>
					{doc.title}
				</button>
			{/each}
		</nav>

		<!-- Bottom actions -->
		<div class="border-t border-paper-border p-3 dark:border-dark-paper-border">
			<button
				class="flex w-full items-center gap-2 rounded-md px-2 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-border/50 dark:text-dark-ink-muted dark:hover:bg-dark-paper-border/50"
			>
				<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
					<path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
				</svg>
				Nueva sección
			</button>

			<button
				onclick={toggleDark}
				class="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-2 font-sans text-sm text-ink-muted transition-colors hover:bg-paper-border/50 dark:text-dark-ink-muted dark:hover:bg-dark-paper-border/50"
			>
				{#if darkMode}
					<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
						<circle cx="7" cy="7" r="3" stroke="currentColor" stroke-width="1.5" />
						<path
							d="M7 1v1M7 12v1M1 7h1M12 7h1M3.05 3.05l.7.7M10.25 10.25l.7.7M10.25 3.75l-.7.7M3.75 10.25l-.7.7"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
						/>
					</svg>
					Modo claro
				{:else}
					<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
						<path
							d="M12 8.5A5.5 5.5 0 0 1 5.5 2a5.5 5.5 0 1 0 6.5 6.5z"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					Modo oscuro
				{/if}
			</button>
		</div>
	</aside>

	<!-- Editor area -->
	<main class="flex flex-1 flex-col overflow-hidden bg-paper dark:bg-dark-paper">
		<!-- Toolbar -->
		<div
			class="flex items-center justify-between border-b border-paper-border px-8 py-3 dark:border-dark-paper-border"
		>
			<div class="flex items-center gap-1">
				{#each toolbarActions as action (action)}
					<button
						class="rounded px-2 py-1 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper-border"
					>
						{action}
					</button>
				{/each}
			</div>
			<div class="flex items-center gap-4">
				<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
					{wordCount} palabras · {readingTime} min lectura
				</span>
				<button
					class="rounded-md bg-accent px-3 py-1.5 font-sans text-xs font-medium text-white transition-colors hover:bg-accent-hover"
				>
					Guardar
				</button>
			</div>
		</div>

		<!-- Writing area — columna centrada de 680px -->
		<div class="flex flex-1 justify-center overflow-y-auto px-8 py-12">
			<div class="w-full max-w-[680px]">
				<input
					type="text"
					value="Diversidad Epistémica y Producción Científica"
					class="mb-8 w-full border-none bg-transparent font-serif text-4xl font-semibold text-ink outline-none placeholder:text-ink-faint dark:text-dark-ink dark:placeholder:text-dark-ink-faint"
					placeholder="Título del documento"
				/>
				<textarea
					bind:value={content}
					rows={30}
					class="w-full resize-none border-none bg-transparent font-serif text-lg leading-[1.75] text-ink outline-none placeholder:text-ink-faint dark:text-dark-ink dark:placeholder:text-dark-ink-faint"
					placeholder="Comienza a escribir..."
				></textarea>
			</div>
		</div>
	</main>
</div>
