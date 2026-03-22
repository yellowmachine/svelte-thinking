<script lang="ts">
	import type { ActionData } from './$types';
	let { form }: { form: ActionData } = $props();
</script>

<div class="min-h-screen bg-paper-ui font-sans dark:bg-dark-paper-ui">

	<!-- ── Nav ──────────────────────────────────────────────────────────────── -->
	<header class="sticky top-0 z-20 border-b border-paper-border bg-paper-ui/90 backdrop-blur-sm dark:border-dark-paper-border dark:bg-dark-paper-ui/90">
		<div class="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
			<div class="flex items-center gap-2">
				<div class="flex h-7 w-7 items-center justify-center rounded bg-accent">
					<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
						<path d="M2 3h10M2 7h7M2 11h5" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
					</svg>
				</div>
				<span class="font-serif text-base font-semibold text-ink dark:text-dark-ink">Scholio</span>
				<span class="rounded-full bg-accent/10 px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wide text-accent">beta</span>
			</div>
			<div class="flex items-center gap-4">
				<a href="/about" class="font-sans text-sm text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink">
					Acerca de
				</a>
				<a href="/blog" class="font-sans text-sm text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink">
					Blog
				</a>
				<a href="/login" class="font-sans text-sm text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink">
					Iniciar sesión
				</a>
				<a href="#waitlist" class="rounded-lg bg-accent px-4 py-1.5 font-sans text-sm font-semibold text-white transition-opacity hover:opacity-90">
					Acceso beta
				</a>
			</div>
		</div>
	</header>

	<!-- ── Hero ─────────────────────────────────────────────────────────────── -->
	<section class="mx-auto max-w-3xl px-6 pb-20 pt-24 text-center">
		<p class="mb-4 font-sans text-xs font-semibold uppercase tracking-widest text-accent">
			Escritura académica colaborativa
		</p>
		<h1 class="font-serif text-5xl font-semibold leading-tight text-ink dark:text-dark-ink sm:text-6xl">
			El entorno que tu<br/>investigación merece
		</h1>
		<p class="mx-auto mt-6 max-w-xl font-sans text-lg leading-relaxed text-ink-muted dark:text-dark-ink-muted">
			Scholio combina un editor Markdown potente, control de versiones, colaboración con roles, citas automáticas y un asistente de IA que conoce tu proyecto — todo en un solo lugar.
		</p>
		<div class="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
			<a href="#waitlist" class="rounded-lg bg-accent px-6 py-3 font-sans text-sm font-semibold text-white transition-opacity hover:opacity-90">
				Solicitar acceso beta
			</a>
			<a href="/login" class="rounded-lg border border-paper-border px-6 py-3 font-sans text-sm text-ink-muted transition-colors hover:bg-paper hover:text-ink dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper">
				Ya tengo cuenta
			</a>
		</div>
		<p class="mt-4 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
			Beta cerrada · Código abierto · Sin tarjeta de crédito
		</p>
	</section>

	<!-- ── Editor preview ───────────────────────────────────────────────────── -->
	<section class="mx-auto max-w-5xl px-6 pb-24">
		<div class="overflow-hidden rounded-2xl border border-paper-border bg-paper shadow-sm dark:border-dark-paper-border dark:bg-dark-paper">
			<!-- Fake toolbar -->
			<div class="flex items-center gap-2 border-b border-paper-border px-4 py-3 dark:border-dark-paper-border">
				<div class="h-3 w-3 rounded-full bg-paper-border dark:bg-dark-paper-border"></div>
				<div class="h-3 w-3 rounded-full bg-paper-border dark:bg-dark-paper-border"></div>
				<div class="h-3 w-3 rounded-full bg-paper-border dark:bg-dark-paper-border"></div>
				<span class="ml-3 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">Impacto de la diversidad epistémica en equipos de investigación.md</span>
			</div>
			<div class="grid sm:grid-cols-2">
				<!-- Editor side -->
				<div class="border-r border-paper-border px-6 py-5 dark:border-dark-paper-border">
					<pre class="overflow-x-auto font-mono text-xs leading-relaxed text-ink-muted dark:text-dark-ink-muted"><code><span class="text-ink dark:text-dark-ink font-semibold"># Introducción</span>

La diversidad epistémica en equipos
interdisciplinares mejora la calidad
de las publicaciones [@page2007].

El efecto es especialmente marcado
en ciencias clínicas[^1] y STEM
[@hong2004; @wuchty2007].

<span class="text-accent">$$</span>
D(E) = -\sum_&#123;i&#125; p_i \log p_i
<span class="text-accent">$$</span>

<span class="text-accent">[^1]</span>: Ver también [[Metodología]]
para el diseño del estudio.</code></pre>
				</div>
				<!-- Preview side -->
				<div class="px-6 py-5">
					<h3 class="font-serif text-xl font-semibold text-ink dark:text-dark-ink">Introducción</h3>
					<p class="mt-3 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
						La diversidad epistémica en equipos interdisciplinares mejora la calidad de las publicaciones
						<span class="text-accent">(Page, 2007)</span>.
					</p>
					<p class="mt-2 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
						El efecto es especialmente marcado en ciencias clínicas<sup class="text-accent font-semibold">1</sup> y STEM
						<span class="text-accent">(Hong & Page, 2004; Wuchty et al., 2007)</span>.
					</p>
					<div class="my-4 rounded bg-paper-ui px-4 py-3 text-center font-mono text-sm text-ink dark:bg-dark-paper-ui dark:text-dark-ink">
						D(E) = −∑ pᵢ log pᵢ
					</div>
					<p class="border-t border-paper-border pt-3 font-sans text-xs text-ink-faint dark:border-dark-paper-border dark:text-dark-ink-faint">
						<sup class="text-accent font-semibold">1</sup> Ver también <span class="text-accent underline decoration-dotted">Metodología</span> para el diseño del estudio.
					</p>
				</div>
			</div>
		</div>
		<p class="mt-3 text-center font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
			Editor y vista previa en vivo · Citas, matemáticas y notas al pie renderizadas al instante
		</p>
	</section>

	<!-- ── Features ─────────────────────────────────────────────────────────── -->
	<section class="border-t border-paper-border py-24 dark:border-dark-paper-border">
		<div class="mx-auto max-w-5xl px-6">
			<h2 class="text-center font-serif text-3xl font-semibold text-ink dark:text-dark-ink">
				Todo lo que necesitas para escribir en serio
			</h2>
			<p class="mx-auto mt-3 max-w-xl text-center font-sans text-base text-ink-muted dark:text-dark-ink-muted">
				Diseñado para investigadores que publican — no para tomar notas rápidas.
			</p>

			<div class="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">

				<!-- Citas -->
				<div class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper">
					<div class="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c5c3e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
						</svg>
					</div>
					<h3 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">Citas y bibliografía automática</h3>
					<p class="mt-2 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
						Gestiona tus referencias con BibTeX. Cita con <code class="rounded bg-paper-ui px-1 font-mono text-xs dark:bg-dark-paper-ui">[@autor2024]</code> y Scholio genera la bibliografía en APA 7, IEEE o Vancouver al final del documento.
					</p>
				</div>

				<!-- Control de versiones -->
				<div class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper">
					<div class="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c5c3e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
						</svg>
					</div>
					<h3 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">Control de versiones para textos</h3>
					<p class="mt-2 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
						Crea commits con mensaje en cualquier momento. Compara versiones con diff visual, restaura versiones anteriores. Tu investigación nunca se pierde.
					</p>
				</div>

				<!-- Colaboración -->
				<div class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper">
					<div class="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c5c3e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
						</svg>
					</div>
					<h3 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">Colaboración con roles</h3>
					<p class="mt-2 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
						Invita coautores, revisores y comentaristas. Los comentarios se anclan al texto exacto. Los hilos se resuelven cuando el cambio se incorpora.
					</p>
				</div>

				<!-- IA -->
				<div class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper">
					<div class="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c5c3e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
						</svg>
					</div>
					<h3 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">Asistente IA con contexto real</h3>
					<p class="mt-2 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
						El asistente lee todos los documentos de tu proyecto antes de responder. No es un chatbot genérico — conoce tu metodología, tus datos y tu argumento.
					</p>
				</div>

				<!-- Matemáticas -->
				<div class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper">
					<div class="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c5c3e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>
						</svg>
					</div>
					<h3 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">Matemáticas y notación formal</h3>
					<p class="mt-2 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
						KaTeX integrado para ecuaciones LaTeX inline y en bloque. Notación lógica, estadística, química — sin salir del editor. También notas al pie numeradas.
					</p>
				</div>

				<!-- Exportación -->
				<div class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper">
					<div class="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c5c3e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
						</svg>
					</div>
					<h3 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">Exporta a LaTeX y Typst</h3>
					<p class="mt-2 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
						Cuando el texto está listo, exporta a <code class="rounded bg-paper-ui px-1 font-mono text-xs dark:bg-dark-paper-ui">.tex</code> o <code class="rounded bg-paper-ui px-1 font-mono text-xs dark:bg-dark-paper-ui">.typ</code> con la bibliografía embebida. Listo para compilar y enviar a la revista.
					</p>
				</div>

				<!-- Gráficos -->
				<div class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper">
					<div class="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c5c3e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
						</svg>
					</div>
					<h3 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">Gráficos desde tus datos</h3>
					<p class="mt-2 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
						Sube un CSV o JSON y genera gráficos Vega-Lite directamente en el documento. Los datos y la visualización viven juntos, versionados.
					</p>
				</div>

				<!-- Wikilinks -->
				<div class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper">
					<div class="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c5c3e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
						</svg>
					</div>
					<h3 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">Red de conocimiento interna</h3>
					<p class="mt-2 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
						Enlaza documentos con <code class="rounded bg-paper-ui px-1 font-mono text-xs dark:bg-dark-paper-ui">[[Título]]</code>. Los backlinks se actualizan solos. Tu proyecto se convierte en una red navegable de ideas.
					</p>
				</div>

				<!-- Open source -->
				<div class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper">
					<div class="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c5c3e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22"/>
						</svg>
					</div>
					<h3 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">Código abierto y self-hosteable</h3>
					<p class="mt-2 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
						Scholio es open source. Tu institución puede desplegarlo en su propia infraestructura. Tus datos son tuyos, siempre.
					</p>
				</div>

			</div>
		</div>
	</section>

	<!-- ── Para quién ────────────────────────────────────────────────────────── -->
	<section class="border-t border-paper-border py-24 dark:border-dark-paper-border">
		<div class="mx-auto max-w-5xl px-6">
			<h2 class="text-center font-serif text-3xl font-semibold text-ink dark:text-dark-ink">
				Hecho para quienes publican
			</h2>
			<div class="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
				<div class="text-center">
					<div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
						<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7c5c3e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
						</svg>
					</div>
					<h3 class="font-serif text-sm font-semibold text-ink dark:text-dark-ink">Investigadores</h3>
					<p class="mt-1 font-sans text-xs leading-relaxed text-ink-muted dark:text-dark-ink-muted">Artículos, tesis, informes técnicos con rigor bibliográfico.</p>
				</div>
				<div class="text-center">
					<div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
						<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7c5c3e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
						</svg>
					</div>
					<h3 class="font-serif text-sm font-semibold text-ink dark:text-dark-ink">Clínicos e investigadores médicos</h3>
					<p class="mt-1 font-sans text-xs leading-relaxed text-ink-muted dark:text-dark-ink-muted">Case reports, revisiones sistemáticas, guías clínicas.</p>
				</div>
				<div class="text-center">
					<div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
						<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7c5c3e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
						</svg>
					</div>
					<h3 class="font-serif text-sm font-semibold text-ink dark:text-dark-ink">Equipos universitarios</h3>
					<p class="mt-1 font-sans text-xs leading-relaxed text-ink-muted dark:text-dark-ink-muted">Grupos de investigación con coautores en distintas instituciones.</p>
				</div>
				<div class="text-center">
					<div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
						<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7c5c3e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
						</svg>
					</div>
					<h3 class="font-serif text-sm font-semibold text-ink dark:text-dark-ink">Doctorandos y postdocs</h3>
					<p class="mt-1 font-sans text-xs leading-relaxed text-ink-muted dark:text-dark-ink-muted">Tesis, papers de conferencia, revisiones de literatura.</p>
				</div>
			</div>
		</div>
	</section>

	<!-- ── Open source ───────────────────────────────────────────────────────── -->
	<section class="border-t border-paper-border py-16 dark:border-dark-paper-border">
		<div class="mx-auto max-w-2xl px-6 text-center">
			<p class="font-sans text-xs font-semibold uppercase tracking-widest text-ink-faint dark:text-dark-ink-faint">Filosofía</p>
			<h2 class="mt-3 font-serif text-2xl font-semibold text-ink dark:text-dark-ink">
				La ciencia es abierta. La herramienta también.
			</h2>
			<p class="mt-4 font-sans text-base leading-relaxed text-ink-muted dark:text-dark-ink-muted">
				Scholio es software libre. El código es auditable, la plataforma es self-hosteable y los datos son completamente tuyos. Construido para la comunidad académica, no para extraer valor de ella.
			</p>
		</div>
	</section>

	<!-- ── Waitlist ──────────────────────────────────────────────────────────── -->
	<section id="waitlist" class="border-t border-paper-border py-24 dark:border-dark-paper-border">
		<div class="mx-auto max-w-md px-6">
			<h2 class="text-center font-serif text-3xl font-semibold text-ink dark:text-dark-ink">
				Únete a la beta
			</h2>
			<p class="mt-3 text-center font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				Estamos abriendo acceso gradualmente. Cuéntanos un poco sobre tu investigación.
			</p>

			{#if form?.success}
				<div class="mt-10 rounded-xl border border-green-200 bg-green-50 px-6 py-8 text-center dark:border-green-900/40 dark:bg-green-900/20">
					<p class="font-serif text-xl font-semibold text-green-800 dark:text-green-300">Solicitud recibida</p>
					<p class="mt-2 font-sans text-sm text-green-700 dark:text-green-400">
						Te avisaremos en <strong>{form.email}</strong> cuando tu acceso esté listo.
					</p>
				</div>
			{:else}
				<form method="POST" action="?/joinWaitlist" class="mt-8">
					<div class="flex flex-col gap-3">
						<input
							type="text"
							name="name"
							placeholder="Tu nombre"
							required
							class="rounded-lg border border-paper-border bg-paper px-4 py-3 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
						/>
						<input
							type="email"
							name="email"
							placeholder="tu@email.com"
							required
							class="rounded-lg border border-paper-border bg-paper px-4 py-3 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
						/>
						<textarea
							name="message"
							placeholder="¿En qué tipo de investigación trabajas? (opcional)"
							rows="3"
							class="resize-none rounded-lg border border-paper-border bg-paper px-4 py-3 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none dark:border-dark-paper-border dark:bg-dark-paper dark:text-dark-ink"
						></textarea>

						{#if form?.error}
							<p class="font-sans text-sm text-red-600 dark:text-red-400">{form.error}</p>
						{/if}

						<button
							type="submit"
							class="rounded-lg bg-accent px-6 py-3 font-sans text-sm font-semibold text-white transition-opacity hover:opacity-90"
						>
							Solicitar acceso
						</button>
					</div>
				</form>
				<p class="mt-4 text-center font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
					Beta cerrada · Sin tarjeta de crédito · Avisamos por email
				</p>
			{/if}
		</div>
	</section>

	<!-- ── Footer ────────────────────────────────────────────────────────────── -->
	<footer class="border-t border-paper-border px-8 py-6 dark:border-dark-paper-border">
		<div class="mx-auto flex max-w-5xl flex-col items-center gap-3 sm:flex-row sm:justify-between">
			<div class="flex items-center gap-2">
				<div class="flex h-6 w-6 items-center justify-center rounded bg-accent">
					<svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
						<path d="M2 3h10M2 7h7M2 11h5" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
					</svg>
				</div>
				<span class="font-serif text-sm font-semibold text-ink dark:text-dark-ink">Scholio</span>
				<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">· scholio.review</span>
			</div>
			<div class="flex items-center gap-4">
				<a href="/conduct" class="font-sans text-xs text-ink-faint transition-colors hover:text-ink-muted dark:text-dark-ink-faint dark:hover:text-dark-ink-muted">
					Código de conducta
				</a>
				<a href="/login" class="font-sans text-xs text-ink-faint transition-colors hover:text-ink-muted dark:text-dark-ink-faint dark:hover:text-dark-ink-muted">
					Iniciar sesión
				</a>
			</div>
			<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
				Impulsado por Claude (Anthropic)
			</p>
		</div>
	</footer>

</div>
