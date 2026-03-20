<div class="mx-auto max-w-3xl px-6 py-10">

	<!-- About Scholio -->
	<div class="mb-10 rounded-xl border border-accent/20 bg-accent/5 px-6 py-5 dark:border-accent/15 dark:bg-accent/10">
		<p class="font-serif text-lg font-semibold text-ink dark:text-dark-ink">
			¿Qué significa <em>Scholio</em>?
		</p>
		<p class="mt-2 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
			Del griego <span class="font-serif italic">σχόλιον (skholion)</span> — la anotación marginal que los eruditos
			escribían en los manuscritos clásicos para comentarlos, explicarlos y preservar el conocimiento.
			Newton usaba <span class="font-serif italic">scholia</span> en los <em>Principia</em> para sus notas explicativas.
			En inglés académico, <span class="font-serif italic">scholium</span> sigue siendo un término vivo en matemáticas y filosofía.
		</p>
	</div>

	<div class="mb-10">
		<h1 class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">Guía de sintaxis</h1>
		<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Referencia completa del editor de Scholio. El editor usa Markdown estándar con extensiones propias para citas, matemáticas, wikilinks y gráficos.
		</p>
	</div>

	<!-- ── Sección ───────────────────────────────────────────────────────────── -->
	<section class="mb-10">
		<h2 class="mb-4 font-serif text-lg font-semibold text-ink dark:text-dark-ink">Formato básico</h2>
		<div class="overflow-hidden rounded-xl border border-paper-border dark:border-dark-paper-border">
			<table class="w-full font-sans text-sm">
				<thead>
					<tr class="border-b border-paper-border bg-paper-ui dark:border-dark-paper-border dark:bg-dark-paper-ui">
						<th class="px-4 py-2.5 text-left font-medium text-ink-muted dark:text-dark-ink-muted">Escribe</th>
						<th class="px-4 py-2.5 text-left font-medium text-ink-muted dark:text-dark-ink-muted">Resultado</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-paper-border dark:divide-dark-paper-border">
					<tr>
						<td class="px-4 py-3"><code class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs dark:bg-dark-paper-ui"># Título</code></td>
						<td class="px-4 py-3 font-serif text-lg font-semibold text-ink dark:text-dark-ink">Título (nivel 1)</td>
					</tr>
					<tr>
						<td class="px-4 py-3"><code class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs dark:bg-dark-paper-ui">## Sección</code></td>
						<td class="px-4 py-3 font-serif text-base font-semibold text-ink dark:text-dark-ink">Sección (nivel 2)</td>
					</tr>
					<tr>
						<td class="px-4 py-3"><code class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs dark:bg-dark-paper-ui">**negrita**</code></td>
						<td class="px-4 py-3 font-sans text-ink dark:text-dark-ink"><strong>negrita</strong></td>
					</tr>
					<tr>
						<td class="px-4 py-3"><code class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs dark:bg-dark-paper-ui">*cursiva*</code></td>
						<td class="px-4 py-3 font-sans italic text-ink dark:text-dark-ink">cursiva</td>
					</tr>
					<tr>
						<td class="px-4 py-3"><code class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs dark:bg-dark-paper-ui">`código`</code></td>
						<td class="px-4 py-3"><code class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs text-ink dark:bg-dark-paper-ui dark:text-dark-ink">código</code></td>
					</tr>
					<tr>
						<td class="px-4 py-3"><code class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs dark:bg-dark-paper-ui">&gt; cita</code></td>
						<td class="px-4 py-3 border-l-2 border-accent pl-3 font-sans text-ink-muted italic dark:text-dark-ink-muted">cita en bloque</td>
					</tr>
					<tr>
						<td class="px-4 py-3"><code class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs dark:bg-dark-paper-ui">- elemento</code></td>
						<td class="px-4 py-3 font-sans text-ink dark:text-dark-ink">• elemento (lista)</td>
					</tr>
					<tr>
						<td class="px-4 py-3"><code class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs dark:bg-dark-paper-ui">1. elemento</code></td>
						<td class="px-4 py-3 font-sans text-ink dark:text-dark-ink">1. elemento (lista numerada)</td>
					</tr>
					<tr>
						<td class="px-4 py-3"><code class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs dark:bg-dark-paper-ui">[texto](url)</code></td>
						<td class="px-4 py-3 font-sans text-accent underline">enlace</td>
					</tr>
					<tr>
						<td class="px-4 py-3"><code class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs dark:bg-dark-paper-ui">---</code></td>
						<td class="px-4 py-3"><hr class="border-paper-border dark:border-dark-paper-border" /></td>
					</tr>
				</tbody>
			</table>
		</div>
	</section>

	<!-- ── Citas ─────────────────────────────────────────────────────────────── -->
	<section class="mb-10">
		<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">Citas bibliográficas</h2>
		<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Las referencias se gestionan en la sección <strong>/bib</strong> de cada proyecto. Una vez añadidas, se citan por su clave en el editor.
		</p>
		<div class="space-y-3">
			<div class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui">
				<p class="font-mono text-sm text-ink dark:text-dark-ink"><span class="text-accent">[@darwin1859]</span></p>
				<p class="mt-1 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">Cita única — se renderiza como "(Darwin, 1859)" en APA o "[1]" en IEEE/Vancouver</p>
			</div>
			<div class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui">
				<p class="font-mono text-sm text-ink dark:text-dark-ink"><span class="text-accent">[@dawkins1976; @gould1979]</span></p>
				<p class="mt-1 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">Múltiples citas separadas por punto y coma</p>
			</div>
		</div>
		<p class="mt-3 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
			Usa el botón <code class="rounded bg-paper-ui px-1 font-mono dark:bg-dark-paper-ui">[@cite]</code> de la barra del editor para buscar y insertar referencias sin escribir la clave a mano. La bibliografía se genera automáticamente al final del documento en el estilo seleccionado (APA 7, IEEE o Vancouver).
		</p>
	</section>

	<!-- ── Matemáticas ───────────────────────────────────────────────────────── -->
	<section class="mb-10">
		<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">Matemáticas</h2>
		<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Renderizado con KaTeX. Usa sintaxis LaTeX estándar.
		</p>
		<div class="space-y-3">
			<div class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui">
				<p class="font-mono text-sm text-ink dark:text-dark-ink">La fórmula <span class="text-accent">$E = mc^2$</span> describe...</p>
				<p class="mt-1 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">Matemáticas <strong>inline</strong> — entre el texto, delimitadas con <code class="font-mono">$...$</code></p>
			</div>
			<div class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui">
				<p class="font-mono text-sm text-ink dark:text-dark-ink"><span class="text-accent">$$</span><br />H = -\sum_&#123;i&#125; p_i \log p_i<br /><span class="text-accent">$$</span></p>
				<p class="mt-1 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">Matemáticas en <strong>bloque</strong> — centradas, delimitadas con <code class="font-mono">$$...$$</code></p>
			</div>
		</div>
	</section>

	<!-- ── Wikilinks ─────────────────────────────────────────────────────────── -->
	<section class="mb-10">
		<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">Wikilinks</h2>
		<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Enlaza documentos entre sí. En la vista previa se convierten en enlaces navegables.
		</p>
		<div class="space-y-3">
			<div class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui">
				<p class="font-mono text-sm text-ink dark:text-dark-ink"><span class="text-accent">[[Introducción]]</span></p>
				<p class="mt-1 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">Enlace a un documento del <strong>mismo proyecto</strong> por título exacto. Los títulos son únicos dentro de cada proyecto.</p>
			</div>
			<div class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui">
				<p class="font-mono text-sm text-ink dark:text-dark-ink"><span class="text-accent">[[Introducción:a3f9b2c1]]</span></p>
				<p class="mt-1 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">Enlace a un documento <strong>público de otro usuario</strong>. El hash son los primeros 8 caracteres del ID del documento — cópialo desde el selector de contexto externo con el botón <code class="font-mono">[[·]]</code>.</p>
			</div>
		</div>
		<p class="mt-3 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
			Los backlinks (documentos que te mencionan) aparecen en el panel "Mencionado en" del editor. El índice de enlaces se actualiza al hacer <strong>commit</strong>, no al guardar el borrador.
		</p>
	</section>

	<!-- ── Gráficos ──────────────────────────────────────────────────────────── -->
	<section class="mb-10">
		<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">Gráficos Vega-Lite</h2>
		<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Los bloques de código con lenguaje <code class="rounded bg-paper-ui px-1 font-mono text-xs dark:bg-dark-paper-ui">vega-lite</code> se renderizan como gráficos interactivos en la vista previa.
		</p>
		<div class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui">
			<pre class="overflow-x-auto font-mono text-xs text-ink dark:text-dark-ink"><code>```vega-lite
&#123;
  "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
  "data": &#123; "$ref": "dataset:resultados" &#125;,
  "mark": "bar",
  "encoding": &#123;
    "x": &#123; "field": "grupo", "type": "nominal" &#125;,
    "y": &#123; "field": "valor", "type": "quantitative" &#125;
  &#125;
&#125;
```</code></pre>
		</div>
		<p class="mt-3 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
			<code class="rounded bg-paper-ui px-1 font-mono dark:bg-dark-paper-ui">"$ref": "dataset:nombre"</code> referencia un dataset subido al proyecto (sección <strong>/datasets</strong>). También puedes poner los datos directamente en el campo <code class="font-mono">"data"</code>.
		</p>
	</section>

	<!-- ── Exportar ──────────────────────────────────────────────────────────── -->
	<section class="mb-10">
		<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">Exportar</h2>
		<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Desde la barra del editor, el menú <strong>Exportar</strong> genera un archivo listo para compilar.
		</p>
		<div class="space-y-3">
			<div class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui">
				<p class="font-sans text-sm font-medium text-ink dark:text-dark-ink">LaTeX <code class="ml-1 font-mono text-xs text-ink-muted dark:text-dark-ink-muted">.tex</code></p>
				<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">Archivo auto-contenido con la bibliografía embebida vía <code class="font-mono">\begin&#123;filecontents*&#125;</code>. Compila directamente con <code class="font-mono">pdflatex</code> + <code class="font-mono">bibtex</code>.</p>
			</div>
			<div class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui">
				<p class="font-sans text-sm font-medium text-ink dark:text-dark-ink">Typst <code class="ml-1 font-mono text-xs text-ink-muted dark:text-dark-ink-muted">.typ</code></p>
				<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">Archivo auto-contenido con la bibliografía embebida. Compila con <a href="https://typst.app" target="_blank" rel="noopener noreferrer" class="text-accent underline decoration-dotted">typst.app</a> o el CLI de Typst.</p>
			</div>
		</div>
	</section>

	<!-- ── Consejos ──────────────────────────────────────────────────────────── -->
	<section>
		<h2 class="mb-4 font-serif text-lg font-semibold text-ink dark:text-dark-ink">Consejos</h2>
		<ul class="space-y-2 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			<li class="flex gap-2"><span class="text-ink-faint dark:text-dark-ink-faint">—</span> El borrador se guarda automáticamente cada 30 segundos. Usa <strong>Guardar</strong> para forzarlo antes.</li>
			<li class="flex gap-2"><span class="text-ink-faint dark:text-dark-ink-faint">—</span> Haz <strong>commit</strong> cuando quieras crear un punto de restauración. Solo los commits actualizan el índice de wikilinks y el historial de versiones.</li>
			<li class="flex gap-2"><span class="text-ink-faint dark:text-dark-ink-faint">—</span> La <strong>vista previa</strong> renderiza citas, matemáticas, wikilinks y gráficos. El editor en sí muestra Markdown en texto plano.</li>
			<li class="flex gap-2"><span class="text-ink-faint dark:text-dark-ink-faint">—</span> Marca un documento como <strong>Público</strong> para que otros usuarios puedan añadirlo como contexto de IA en sus proyectos.</li>
			<li class="flex gap-2"><span class="text-ink-faint dark:text-dark-ink-faint">—</span> El asistente IA tiene acceso a todos los borradores del proyecto. Cuanto más contenido haya, mejores respuestas dará.</li>
		</ul>
	</section>

</div>
