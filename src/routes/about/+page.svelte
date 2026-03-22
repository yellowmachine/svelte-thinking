<div class="min-h-screen bg-paper-ui font-sans dark:bg-dark-paper-ui">

	<!-- ── Nav ──────────────────────────────────────────────────────────────── -->
	<header class="sticky top-0 z-20 border-b border-paper-border bg-paper-ui/90 backdrop-blur-sm dark:border-dark-paper-border dark:bg-dark-paper-ui/90">
		<div class="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
			<div class="flex items-center gap-2">
				<a href="/" class="flex items-center gap-2">
					<div class="flex h-7 w-7 items-center justify-center rounded bg-accent">
						<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
							<path d="M2 3h10M2 7h7M2 11h5" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
						</svg>
					</div>
					<span class="font-serif text-base font-semibold text-ink dark:text-dark-ink">Scholio</span>
					<span class="rounded-full bg-accent/10 px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wide text-accent">beta</span>
				</a>
			</div>
			<div class="flex items-center gap-4">
				<a href="/blog" class="font-sans text-sm text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink">
					Blog
				</a>
				<a href="/login" class="font-sans text-sm text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink">
					Iniciar sesión
				</a>
				<a href="/#waitlist" class="rounded-lg bg-accent px-4 py-1.5 font-sans text-sm font-semibold text-white transition-opacity hover:opacity-90">
					Acceso beta
				</a>
			</div>
		</div>
	</header>

	<!-- ── Content ───────────────────────────────────────────────────────────── -->
	<main class="mx-auto max-w-2xl px-6 pb-24 pt-20">

		<!-- Placeholder foto -->
		<div class="mb-10 flex flex-col items-start gap-8 sm:flex-row sm:items-center">
			<div class="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-accent/10 text-3xl font-serif font-semibold text-accent">
				MA
			</div>
			<div>
				<h1 class="font-serif text-3xl font-semibold text-ink dark:text-dark-ink">
					Miguel Ángel Alarcos Torrecillas
				</h1>
				<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
					Ingeniero Técnico en Informática de Sistemas · Almería, Andalucía
				</p>
				<div class="mt-3 flex items-center gap-4">
					<a
						href="https://github.com/yellowmachine"
						target="_blank"
						rel="noopener noreferrer"
						class="flex items-center gap-1.5 font-sans text-sm text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
						aria-label="GitHub"
					>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
							<path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"/>
						</svg>
						GitHub
					</a>
					<a
						href="mailto:miguel@scholio.review"
						class="flex items-center gap-1.5 font-sans text-sm text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
					>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
							<path d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						miguel@scholio.review
					</a>
				</div>
			</div>
		</div>

		<!-- Sobre el proyecto -->
		<section class="space-y-6 border-t border-paper-border pt-10 dark:border-dark-paper-border">
			<h2 class="font-serif text-xl font-semibold text-ink dark:text-dark-ink">Por qué existe Scholio</h2>
			<p class="font-sans text-base leading-relaxed text-ink-muted dark:text-dark-ink-muted">
				Scholio nació de una necesidad concreta: quería una herramienta que me ayudara en mis propias investigaciones, que entendiera el contexto de mis documentos, que manejara citas con rigor y que no me obligara a cambiar de aplicación cada vez que necesitaba consultar algo o redactar un borrador.
			</p>
			<p class="font-sans text-base leading-relaxed text-ink-muted dark:text-dark-ink-muted">
				No encontré esa herramienta, así que la construí. Scholio es el entorno que me habría gustado tener desde el principio: editor Markdown, gestión bibliográfica, control de versiones de documentos, colaboración con roles y un asistente de IA que conoce tu proyecto — no un chatbot genérico, sino un agente que trabaja sobre tus propios textos y referencias.
			</p>
			<p class="font-sans text-base leading-relaxed text-ink-muted dark:text-dark-ink-muted">
				Soy el único desarrollador. Eso significa que cada decisión de diseño y cada línea de código responden a un criterio claro: si no me sirve a mí como investigador, no entra en el producto.
			</p>
		</section>

		<!-- Transparencia -->
		<section class="mt-10 space-y-4 rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper">
			<h2 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">Transparencia</h2>
			<ul class="space-y-2 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
				<li>· Scholio está en <strong class="text-ink dark:text-dark-ink">beta cerrada</strong>. El acceso es por invitación mientras estabilizo la plataforma.</li>
				<li>· Tus datos y documentos <strong class="text-ink dark:text-dark-ink">no se usan para entrenar modelos de IA</strong>. La integración con proveedores externos (OpenRouter, Perplexity) se rige por sus propias políticas, que puedes consultar en los ajustes.</li>
				<li>· El proyecto es <strong class="text-ink dark:text-dark-ink">independiente</strong>, sin inversores ni agenda de monetización agresiva.</li>
			</ul>
		</section>

		<div class="mt-12 text-center">
			<a href="/#waitlist" class="rounded-lg bg-accent px-6 py-3 font-sans text-sm font-semibold text-white transition-opacity hover:opacity-90">
				Solicitar acceso beta
			</a>
		</div>
	</main>

	<!-- ── Footer ────────────────────────────────────────────────────────────── -->
	<footer class="border-t border-paper-border py-8 dark:border-dark-paper-border">
		<div class="mx-auto max-w-5xl px-6 text-center font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
			© 2025 Scholio · <a href="/conduct" class="hover:text-ink-muted dark:hover:text-dark-ink-muted">Código de conducta</a>
		</div>
	</footer>

</div>
