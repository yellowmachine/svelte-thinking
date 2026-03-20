<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<svelte:head>
	<title>Código de conducta · Scholio</title>
	<meta name="description" content="Normas de uso y convivencia de la plataforma Scholio." />
</svelte:head>

<div class="mx-auto max-w-2xl px-6 py-16">
	<a
		href={resolve('/')}
		class="mb-10 inline-flex items-center gap-1.5 font-sans text-sm text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
	>
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<path d="M19 12H5M12 5l-7 7 7 7"/>
		</svg>
		Volver
	</a>

	<h1 class="font-serif text-4xl font-semibold text-ink dark:text-dark-ink">Código de conducta</h1>

	<p class="mt-5 font-sans text-base leading-relaxed text-ink-muted dark:text-dark-ink-muted">
		Scholio es una plataforma para quien quiere investigar, escribir y pensar con rigor — seas investigador
		académico, estudiante, periodista o simplemente alguien con curiosidad intelectual. No importa tu
		institución ni tu título: si trabajas con ideas y quieres hacerlo bien, este es tu sitio.
	</p>
	<p class="mt-3 font-sans text-base leading-relaxed text-ink-muted dark:text-dark-ink-muted">
		Para que funcione para todos, hay algunas reglas básicas.
	</p>

	<hr class="my-10 border-paper-border dark:border-dark-paper-border" />

	<div class="flex flex-col gap-10">

		<section>
			<h2 class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">Lo que esperamos de ti</h2>

			<div class="mt-6 flex flex-col gap-6">
				<div>
					<h3 class="font-sans text-sm font-semibold uppercase tracking-wide text-ink dark:text-dark-ink">Honestidad intelectual</h3>
					<p class="mt-2 font-sans text-base leading-relaxed text-ink-muted dark:text-dark-ink-muted">
						El trabajo que publicas o compartes en Scholio es tuyo, o está correctamente atribuido a sus
						autores. No uses la plataforma para presentar ideas ajenas como propias ni para facilitar el
						plagio a otros.
					</p>
				</div>

				<div>
					<h3 class="font-sans text-sm font-semibold uppercase tracking-wide text-ink dark:text-dark-ink">Transparencia con la IA</h3>
					<p class="mt-2 font-sans text-base leading-relaxed text-ink-muted dark:text-dark-ink-muted">
						El asistente de Scholio existe para ayudarte a investigar y escribir mejor, no para sustituir
						tu pensamiento. Si usas IA para generar o reformular contenido en tus documentos, decláralo —
						en el propio documento o en los metadatos del proyecto. La comunidad académica está construyendo
						normas sobre esto; mientras tanto, la transparencia es siempre la respuesta correcta.
					</p>
				</div>

				<div>
					<h3 class="font-sans text-sm font-semibold uppercase tracking-wide text-ink dark:text-dark-ink">Respeto en la colaboración</h3>
					<p class="mt-2 font-sans text-base leading-relaxed text-ink-muted dark:text-dark-ink-muted">
						Los proyectos compartidos implican confianza. Trata el trabajo de tus colaboradores con el
						mismo cuidado que tratas el tuyo. Las disputas sobre autoría o acceso deben resolverse entre
						las personas implicadas; si necesitas apoyo, puedes contactarnos.
					</p>
				</div>

				<div>
					<h3 class="font-sans text-sm font-semibold uppercase tracking-wide text-ink dark:text-dark-ink">Contenido responsable</h3>
					<p class="mt-2 font-sans text-base leading-relaxed text-ink-muted dark:text-dark-ink-muted">
						No subas material protegido por derechos de autor sin tener los derechos para hacerlo. Si tu
						investigación involucra datos de personas, asegúrate de tener su consentimiento y de cumplir
						la normativa aplicable.
					</p>
				</div>

				<div>
					<h3 class="font-sans text-sm font-semibold uppercase tracking-wide text-ink dark:text-dark-ink">Sin usos maliciosos</h3>
					<p class="mt-2 font-sans text-base leading-relaxed text-ink-muted dark:text-dark-ink-muted">
						No intentes acceder a proyectos o documentos que no son tuyos. No uses el asistente de IA
						para intentar extraer información de otros usuarios. No uses Scholio para distribuir
						desinformación.
					</p>
				</div>
			</div>
		</section>

		<hr class="border-paper-border dark:border-dark-paper-border" />

		<section>
			<h2 class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">Cómo gestionamos las infracciones</h2>
			<p class="mt-3 font-sans text-base leading-relaxed text-ink-muted dark:text-dark-ink-muted">
				Creemos en dar oportunidades para corregir. El proceso habitual es:
			</p>

			<ol class="mt-5 flex flex-col gap-4">
				{#each [
					{ n: '1', label: 'Primera infracción', desc: 'Aviso por email explicando qué ocurrió y qué esperamos.' },
					{ n: '2', label: 'Segunda infracción', desc: 'Aviso formal y restricción temporal de algunas funciones.' },
					{ n: '3', label: 'Tercera infracción', desc: 'Suspensión de la cuenta.' }
				] as step (step.n)}
					<li class="flex gap-4">
						<span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 font-sans text-sm font-semibold text-accent">
							{step.n}
						</span>
						<div>
							<p class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">{step.label}</p>
							<p class="mt-0.5 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">{step.desc}</p>
						</div>
					</li>
				{/each}
			</ol>

			<p class="mt-5 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
				Nos reservamos el derecho de saltarnos este proceso en casos graves: acceso no autorizado a datos
				de otros usuarios, fraude deliberado o cualquier actividad que ponga en riesgo la plataforma o a
				otros usuarios.
			</p>
		</section>

		<hr class="border-paper-border dark:border-dark-paper-border" />

		<section>
			<h2 class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">Una nota sobre el espíritu de estas reglas</h2>
			<p class="mt-3 font-sans text-base leading-relaxed text-ink-muted dark:text-dark-ink-muted">
				Scholio nace de la convicción de que el conocimiento debería ser accesible para cualquiera que
				quiera trabajarlo en serio. Este código no existe para poner barreras, sino para proteger ese
				espíritu. Si tienes dudas sobre si algo está bien o mal, la pregunta útil es:
				<em>¿estaría cómodo explicando lo que hago a mis colaboradores?</em>
				Si la respuesta es sí, probablemente estás en buen camino.
			</p>
			<p class="mt-4 font-sans text-base leading-relaxed text-ink-muted dark:text-dark-ink-muted">
				¿Alguna pregunta o problema? Escríbenos a
				<a href="mailto:conduct@scholio.app" class="text-accent underline underline-offset-2">conduct@scholio.app</a>.
			</p>
		</section>

	</div>

	<p class="mt-16 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
		Última actualización: marzo 2026
	</p>
</div>
