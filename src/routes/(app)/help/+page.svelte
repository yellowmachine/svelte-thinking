<script lang="ts">
	import Callout from '$lib/components/ui/Callout.svelte';
</script>

<div class="mx-auto max-w-3xl px-6 py-10">

	<!-- About Scholio -->
	<div class="mb-10 rounded-xl border border-accent/20 bg-accent/5 px-6 py-5 dark:border-accent/15 dark:bg-accent/10">
		<p class="font-serif text-lg font-semibold text-ink dark:text-dark-ink">
			What does <em>Scholio</em> mean?
		</p>
		<p class="mt-2 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
			From Greek <span class="font-serif italic">σχόλιον (skholion)</span> — the marginal annotation that scholars
			wrote in classical manuscripts to comment, explain and preserve knowledge.
			Newton used <span class="font-serif italic">scholia</span> in the <em>Principia</em> for his explanatory notes.
			In academic English, <span class="font-serif italic">scholium</span> remains a living term in mathematics and philosophy.
		</p>
	</div>

	<div class="mb-10">
		<h1 class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">Syntax guide</h1>
		<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Complete reference for the Scholio editor. Uses standard Markdown with custom extensions for citations, math, wikilinks and charts.
		</p>
	</div>

	<!-- ── Sección ───────────────────────────────────────────────────────────── -->
	<section class="mb-10">
		<h2 class="mb-4 font-serif text-lg font-semibold text-ink dark:text-dark-ink">Basic formatting</h2>
		<div class="overflow-hidden rounded-xl border border-paper-border dark:border-dark-paper-border">
			<table class="w-full font-sans text-sm">
				<thead>
					<tr class="border-b border-paper-border bg-paper-ui dark:border-dark-paper-border dark:bg-dark-paper-ui">
						<th class="px-4 py-2.5 text-left font-medium text-ink-muted dark:text-dark-ink-muted">Write</th>
						<th class="px-4 py-2.5 text-left font-medium text-ink-muted dark:text-dark-ink-muted">Result</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-paper-border dark:divide-dark-paper-border">
					<tr>
						<td class="px-4 py-3"><code class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs dark:bg-dark-paper-ui"># Title</code></td>
						<td class="px-4 py-3 font-serif text-lg font-semibold text-ink dark:text-dark-ink">Title (level 1)</td>
					</tr>
					<tr>
						<td class="px-4 py-3"><code class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs dark:bg-dark-paper-ui">## Section</code></td>
						<td class="px-4 py-3 font-serif text-base font-semibold text-ink dark:text-dark-ink">Section (level 2)</td>
					</tr>
					<tr>
						<td class="px-4 py-3"><code class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs dark:bg-dark-paper-ui">**bold**</code></td>
						<td class="px-4 py-3 font-sans text-ink dark:text-dark-ink"><strong>bold</strong></td>
					</tr>
					<tr>
						<td class="px-4 py-3"><code class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs dark:bg-dark-paper-ui">*italic*</code></td>
						<td class="px-4 py-3 font-sans italic text-ink dark:text-dark-ink">italic</td>
					</tr>
					<tr>
						<td class="px-4 py-3"><code class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs dark:bg-dark-paper-ui">`code`</code></td>
						<td class="px-4 py-3"><code class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs text-ink dark:bg-dark-paper-ui dark:text-dark-ink">code</code></td>
					</tr>
					<tr>
						<td class="px-4 py-3"><code class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs dark:bg-dark-paper-ui">&gt; quote</code></td>
						<td class="px-4 py-3 border-l-2 border-accent pl-3 font-sans text-ink-muted italic dark:text-dark-ink-muted">block quote</td>
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
						<td class="px-4 py-3 font-sans text-accent underline">link</td>
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
		<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">Bibliographic citations</h2>
		<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			References are managed in the <strong>/bib</strong> section of each project. Once added, they are cited by key in the editor.
		</p>
		<div class="space-y-3">
			<div class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui">
				<p class="font-mono text-sm text-ink dark:text-dark-ink"><span class="text-accent">[[@darwin1859]]</span></p>
				<p class="mt-1 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">Single citation — renders as "(Darwin, 1859)" in APA or "[1]" in IEEE/Vancouver</p>
			</div>
			<div class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui">
				<p class="font-mono text-sm text-ink dark:text-dark-ink"><span class="text-accent">[[@dawkins1976; @gould1979]]</span></p>
				<p class="mt-1 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">Multiple citations separated by semicolons</p>
			</div>
		</div>
		<Callout>Use the <code class="rounded bg-paper-ui px-1 font-mono dark:bg-dark-paper-ui">[[@cite]]</code> button in the editor toolbar to search and insert references without typing the key manually. The bibliography is generated automatically at the end of the document in the selected style (APA 7, IEEE or Vancouver).</Callout>
	</section>

	<!-- ── Mathematics ───────────────────────────────────────────────────────── -->
	<section class="mb-10">
		<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">Mathematics</h2>
		<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Rendered with KaTeX. Uses standard LaTeX syntax.
		</p>
		<div class="space-y-3">
			<div class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui">
				<p class="font-mono text-sm text-ink dark:text-dark-ink">The formula <span class="text-accent">$E = mc^2$</span> describes...</p>
				<p class="mt-1 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">Mathematics <strong>inline</strong> — within the text, delimited with <code class="font-mono">$...$</code></p>
			</div>
			<div class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui">
				<p class="font-mono text-sm text-ink dark:text-dark-ink"><span class="text-accent">$$</span><br />H = -\sum_&#123;i&#125; p_i \log p_i<br /><span class="text-accent">$$</span></p>
				<p class="mt-1 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">Mathematics <strong>block</strong> — centered, delimited with <code class="font-mono">$$...$$</code></p>
			</div>
		</div>
	</section>

	<!-- ── Formal logic ─────────────────────────────────────────────────────── -->
	<section class="mb-10">
		<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">Formal logic</h2>
		<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Use LaTeX syntax with KaTeX for standard logical notation, inline with <code class="rounded bg-paper-ui px-1 font-mono text-xs dark:bg-dark-paper-ui">$...$</code> or block with <code class="rounded bg-paper-ui px-1 font-mono text-xs dark:bg-dark-paper-ui">$$...$$</code>.
		</p>
		<div class="overflow-hidden rounded-xl border border-paper-border dark:border-dark-paper-border">
			<table class="w-full font-sans text-sm">
				<thead>
					<tr class="border-b border-paper-border bg-paper-ui dark:border-dark-paper-border dark:bg-dark-paper-ui">
						<th class="px-4 py-2.5 text-left font-medium text-ink-muted dark:text-dark-ink-muted">Write</th>
						<th class="px-4 py-2.5 text-left font-medium text-ink-muted dark:text-dark-ink-muted">Symbol</th>
						<th class="px-4 py-2.5 text-left font-medium text-ink-muted dark:text-dark-ink-muted">Name</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-paper-border dark:divide-dark-paper-border">
					<tr>
						<td class="px-4 py-3"><code class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs dark:bg-dark-paper-ui">$\neg p$</code></td>
						<td class="px-4 py-3 font-serif text-ink dark:text-dark-ink">¬p</td>
						<td class="px-4 py-3 font-sans text-ink-muted dark:text-dark-ink-muted">Negation</td>
					</tr>
					<tr>
						<td class="px-4 py-3"><code class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs dark:bg-dark-paper-ui">$p \land q$</code></td>
						<td class="px-4 py-3 font-serif text-ink dark:text-dark-ink">p ∧ q</td>
						<td class="px-4 py-3 font-sans text-ink-muted dark:text-dark-ink-muted">Conjunction</td>
					</tr>
					<tr>
						<td class="px-4 py-3"><code class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs dark:bg-dark-paper-ui">$p \lor q$</code></td>
						<td class="px-4 py-3 font-serif text-ink dark:text-dark-ink">p ∨ q</td>
						<td class="px-4 py-3 font-sans text-ink-muted dark:text-dark-ink-muted">Disjunction</td>
					</tr>
					<tr>
						<td class="px-4 py-3"><code class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs dark:bg-dark-paper-ui">$p \rightarrow q$</code></td>
						<td class="px-4 py-3 font-serif text-ink dark:text-dark-ink">p → q</td>
						<td class="px-4 py-3 font-sans text-ink-muted dark:text-dark-ink-muted">Implication</td>
					</tr>
					<tr>
						<td class="px-4 py-3"><code class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs dark:bg-dark-paper-ui">$p \leftrightarrow q$</code></td>
						<td class="px-4 py-3 font-serif text-ink dark:text-dark-ink">p ↔ q</td>
						<td class="px-4 py-3 font-sans text-ink-muted dark:text-dark-ink-muted">Biconditional</td>
					</tr>
					<tr>
						<td class="px-4 py-3"><code class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs dark:bg-dark-paper-ui">$\forall x$</code></td>
						<td class="px-4 py-3 font-serif text-ink dark:text-dark-ink">∀x</td>
						<td class="px-4 py-3 font-sans text-ink-muted dark:text-dark-ink-muted">Universal quantifier</td>
					</tr>
					<tr>
						<td class="px-4 py-3"><code class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs dark:bg-dark-paper-ui">$\exists x$</code></td>
						<td class="px-4 py-3 font-serif text-ink dark:text-dark-ink">∃x</td>
						<td class="px-4 py-3 font-sans text-ink-muted dark:text-dark-ink-muted">Existential quantifier</td>
					</tr>
					<tr>
						<td class="px-4 py-3"><code class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs dark:bg-dark-paper-ui">$\therefore$</code></td>
						<td class="px-4 py-3 font-serif text-ink dark:text-dark-ink">∴</td>
						<td class="px-4 py-3 font-sans text-ink-muted dark:text-dark-ink-muted">Therefore</td>
					</tr>
					<tr>
						<td class="px-4 py-3"><code class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs dark:bg-dark-paper-ui">$\bot$</code></td>
						<td class="px-4 py-3 font-serif text-ink dark:text-dark-ink">⊥</td>
						<td class="px-4 py-3 font-sans text-ink-muted dark:text-dark-ink-muted">Contradiction</td>
					</tr>
					<tr>
						<td class="px-4 py-3"><code class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs dark:bg-dark-paper-ui">$\top$</code></td>
						<td class="px-4 py-3 font-serif text-ink dark:text-dark-ink">⊤</td>
						<td class="px-4 py-3 font-sans text-ink-muted dark:text-dark-ink-muted">Tautology</td>
					</tr>
					<tr>
						<td class="px-4 py-3"><code class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs dark:bg-dark-paper-ui">$x \in A$</code></td>
						<td class="px-4 py-3 font-serif text-ink dark:text-dark-ink">x ∈ A</td>
						<td class="px-4 py-3 font-sans text-ink-muted dark:text-dark-ink-muted">Membership</td>
					</tr>
					<tr>
						<td class="px-4 py-3"><code class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs dark:bg-dark-paper-ui">$A \subseteq B$</code></td>
						<td class="px-4 py-3 font-serif text-ink dark:text-dark-ink">A ⊆ B</td>
						<td class="px-4 py-3 font-sans text-ink-muted dark:text-dark-ink-muted">Subset</td>
					</tr>
				</tbody>
			</table>
		</div>
		<div class="mt-3 rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui">
			<p class="font-mono text-sm text-ink dark:text-dark-ink"><span class="text-accent">$$\forall x (P(x) \rightarrow Q(x)) \land \exists x \neg Q(x) \therefore \exists x \neg P(x)$$</span></p>
			<p class="mt-1 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">Example of a complete block formula</p>
		</div>
	</section>

	<!-- ── Wikilinks ─────────────────────────────────────────────────────────── -->
	<section class="mb-10">
		<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">Wikilinks</h2>
		<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Link documents to each other. In the preview they become navigable links.
		</p>
		<div class="space-y-3">
			<div class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui">
				<p class="font-mono text-sm text-ink dark:text-dark-ink"><span class="text-accent">[[Introduction]]</span></p>
				<p class="mt-1 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">Link to a document in the <strong>same project</strong> by exact title. Titles are unique within each project.</p>
			</div>
			<div class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui">
				<p class="font-mono text-sm text-ink dark:text-dark-ink"><span class="text-accent">[[Introduction:a3f9b2c1]]</span></p>
				<p class="mt-1 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">Link to a <strong>public document from another user</strong>. The hash is the first 8 characters of the document ID — copy it from the external context picker using the <code class="font-mono">[[·]]</code> button.</p>
			</div>
		</div>
		<Callout>Backlinks (documents that mention you) appear in the "Mentioned in" panel of the editor. The link index is updated on <strong>commit</strong>, not on draft save.</Callout>
	</section>

	<!-- ── [[ dispatcher ─────────────────────────────────────────────────── -->
	<section class="mb-10">
		<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">Editor autocomplete (<code class="font-mono text-base">[[</code>)</h2>
		<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Type <code class="rounded bg-paper-ui px-1 font-mono text-xs dark:bg-dark-paper-ui">[[</code> followed by a trigger prefix to open a specific autocomplete. All structured tokens share the same <code class="rounded bg-paper-ui px-1 font-mono text-xs dark:bg-dark-paper-ui">[[</code> dispatcher.
		</p>
		<div class="space-y-3">
			<div class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui">
				<p class="font-mono text-sm text-ink dark:text-dark-ink"><span class="text-accent">[[doc:Introduction</span> → inserts <span class="text-accent">[[doc:&lt;id&gt;|Introduction]]</span></p>
				<p class="mt-1 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">Type <code class="rounded bg-paper-ui px-1 font-mono text-xs dark:bg-dark-paper-ui">[[doc:</code> to search for a document in the project by title. Autocomplete opens automatically after the colon.</p>
			</div>
			<div class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui">
				<p class="font-mono text-sm text-ink dark:text-dark-ink"><span class="text-accent">[[@darwin1859]]</span></p>
				<p class="mt-1 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">Insert a bibliographic citation. Autocompletes from the project references.</p>
			</div>
			<div class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui">
				<p class="font-mono text-sm text-ink dark:text-dark-ink"><span class="text-accent">[[#Methodology]]</span></p>
				<p class="mt-1 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">Internal anchor link to a heading in the current document.</p>
			</div>
			<div class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui">
				<p class="font-mono text-sm text-ink dark:text-dark-ink"><span class="text-accent">[[^]]</span> → inserts <span class="text-accent">[^1]</span> + definition at end</p>
				<p class="mt-1 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">Insert a numbered footnote. The definition is added automatically at the bottom.</p>
			</div>
			<div class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui">
				<p class="font-mono text-sm text-ink dark:text-dark-ink"><span class="text-accent">[[pKarl</span> → inserts <span class="text-accent">[[person:Karl Barth]]</span></p>
				<p class="mt-1 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">Type <code class="rounded bg-paper-ui px-1 font-mono text-xs dark:bg-dark-paper-ui">[[p</code> followed by at least one character to search for a person by name using AI. Renders as the name in the preview with a dotted underline. Hovering the cursor over it shows a brief author card (dates, field, origin).</p>
			</div>
			<div class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui">
				<p class="font-mono text-sm text-ink dark:text-dark-ink"><span class="text-accent">[[!whiteboard</span> → inserts <span class="text-accent">![caption](/api/photos/…)</span></p>
				<p class="mt-1 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">Type <code class="rounded bg-paper-ui px-1 font-mono text-xs dark:bg-dark-paper-ui">[[!</code> to search project photos by filename or description. A thumbnail preview appears in the dropdown. Selecting one embeds the image with a permanent proxy URL that never expires.</p>
			</div>
		</div>
	</section>

	<!-- ── Footnotes ──────────────────────────────────────────────────────── -->
	<section class="mb-10">
		<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">Footnotes</h2>
		<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Add numbered footnotes that are automatically generated at the end of the document with return links.
		</p>
		<div class="space-y-3">
			<div class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui">
				<p class="font-mono text-sm text-ink dark:text-dark-ink">The theory was proposed by Kuhn<span class="text-accent">[^1]</span> and later expanded<span class="text-accent">[^kuhn]</span>.</p>
				<p class="mt-1 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">Mark in the text — the key can be a number or a word. Renders as a numbered superscript.</p>
			</div>
			<div class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui">
				<p class="font-mono text-sm text-ink dark:text-dark-ink">
					<span class="text-accent">[^1]</span>: Kuhn, T. S. (1962). <em>The Structure of Scientific Revolutions</em>.<br />
					<span class="text-accent">[^kuhn]</span>: Feyerabend, P. (1975). <em>Against Method</em>.
				</p>
				<p class="mt-1 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">Note definition — can go anywhere in the document, usually at the end.</p>
			</div>
		</div>
		<Callout>Footnotes and bibliographic citations <code class="rounded bg-paper-ui px-1 font-mono dark:bg-dark-paper-ui">[[@key]]</code> are complementary: use citations for formal references that appear in the bibliography, and footnotes for clarifications, comments or informal references.</Callout>
	</section>

	<!-- ── Gráficos ──────────────────────────────────────────────────────────── -->
	<section class="mb-10">
		<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">Vega-Lite charts</h2>
		<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Code blocks with language <code class="rounded bg-paper-ui px-1 font-mono text-xs dark:bg-dark-paper-ui">vega-lite</code> render as interactive charts in the preview.
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
		<Callout><code class="rounded bg-paper-ui px-1 font-mono dark:bg-dark-paper-ui">"$ref": "dataset:name"</code> references a dataset uploaded to the project (<strong>/datasets</strong> section). You can also put the data directly in the <code class="font-mono">"data"</code> field.</Callout>
	</section>

	<!-- ── Photos ───────────────────────────────────────────────────────────── -->
	<section class="mb-10">
		<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">Photos</h2>
		<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Upload photos of whiteboards, sketches or notes in the <strong>Photos</strong> section of a project. Each photo can have an optional description used for search and autocomplete.
		</p>
		<div class="space-y-3">
			<div class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui">
				<p class="font-sans text-sm font-medium text-ink dark:text-dark-ink">Embed in a document</p>
				<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">Type <code class="rounded bg-paper-ui px-1 font-mono dark:bg-dark-paper-ui">[[!</code> in the editor and start typing the filename or description. Select a photo from the dropdown to insert <code class="rounded bg-paper-ui px-1 font-mono dark:bg-dark-paper-ui">![caption](/api/photos/id)</code>.</p>
			</div>
			<div class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui">
				<p class="font-sans text-sm font-medium text-ink dark:text-dark-ink">Copy as Markdown</p>
				<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">Hover a photo in the gallery and click the copy icon to get the <code class="rounded bg-paper-ui px-1 font-mono dark:bg-dark-paper-ui">![…](…)</code> snippet ready to paste anywhere.</p>
			</div>
			<div class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui">
				<p class="font-sans text-sm font-medium text-ink dark:text-dark-ink">Permanent URLs</p>
				<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">Images are served via <code class="rounded bg-paper-ui px-1 font-mono dark:bg-dark-paper-ui">/api/photos/&lt;id&gt;</code> — an authenticated proxy. Links embedded in documents never expire regardless of S3 bucket policy.</p>
			</div>
		</div>
		<Callout>Photos require S3-compatible storage configured in <strong>Settings → Storage</strong>. For local development, point it at a Minio instance with a public bucket.</Callout>
	</section>

	<!-- ── Export ──────────────────────────────────────────────────────────── -->
	<section class="mb-10">
		<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">Export</h2>
		<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			From the editor toolbar, the <strong>Export</strong> menu generates a file ready to compile.
		</p>
		<div class="space-y-3">
			<div class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui">
				<p class="font-sans text-sm font-medium text-ink dark:text-dark-ink">LaTeX <code class="ml-1 font-mono text-xs text-ink-muted dark:text-dark-ink-muted">.tex</code></p>
				<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">Self-contained file with bibliography embedded via <code class="font-mono">\begin&#123;filecontents*&#125;</code>. Compile directly with <code class="font-mono">pdflatex</code> + <code class="font-mono">bibtex</code>.</p>
			</div>
			<div class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui">
				<p class="font-sans text-sm font-medium text-ink dark:text-dark-ink">Typst <code class="ml-1 font-mono text-xs text-ink-muted dark:text-dark-ink-muted">.typ</code></p>
				<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">Self-contained file with bibliography embedded. Compile with <a href="https://typst.app" target="_blank" rel="noopener noreferrer" class="text-accent underline decoration-dotted">typst.app</a> or the Typst CLI.</p>
			</div>
		</div>
	</section>

	<!-- ── Tips ──────────────────────────────────────────────────────────── -->
	<section>
		<h2 class="mb-4 font-serif text-lg font-semibold text-ink dark:text-dark-ink">Tips</h2>
		<ul class="space-y-2 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			<li class="flex gap-2"><span class="text-ink-faint dark:text-dark-ink-faint">—</span> The draft saves automatically every 30 seconds. Use <strong>Save</strong> to force it earlier.</li>
			<li class="flex gap-2"><span class="text-ink-faint dark:text-dark-ink-faint">—</span> Make a <strong>commit</strong> when you want to create a restore point. Only commits update the wikilink index and version history.</li>
			<li class="flex gap-2"><span class="text-ink-faint dark:text-dark-ink-faint">—</span> The <strong>preview</strong> renders citations, math, wikilinks and charts. The editor itself shows plain-text Markdown.</li>
			<li class="flex gap-2"><span class="text-ink-faint dark:text-dark-ink-faint">—</span> Mark a document as <strong>Public</strong> so other users can add it as AI context in their projects.</li>
			<li class="flex gap-2"><span class="text-ink-faint dark:text-dark-ink-faint">—</span> The AI assistant has access to all project drafts. The more content there is, the better the responses will be.</li>
		</ul>
	</section>

</div>
