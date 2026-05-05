<script lang="ts">
	import Callout from '$lib/components/ui/Callout.svelte';
</script>

<div class="mx-auto max-w-3xl px-6 py-10">
	<!-- What does Scholio mean -->
	<div
		class="mb-10 rounded-xl border border-accent/20 bg-accent/5 px-6 py-5 dark:border-accent/15 dark:bg-accent/10"
	>
		<p class="font-serif text-lg font-semibold text-ink dark:text-dark-ink">
			What does <em>Scholio</em> mean?
		</p>
		<p class="mt-2 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
			From Greek <span class="font-serif italic">σχόλιον (skholion)</span> — the marginal annotation
			that scholars wrote in classical manuscripts to comment, explain and preserve knowledge.
			Newton used <span class="font-serif italic">scholia</span> in the <em>Principia</em> for his
			explanatory notes. In academic English, <span class="font-serif italic">scholium</span> remains
			a living term in mathematics and philosophy.
		</p>
	</div>

	<!-- ═══════════════════════════════════════════════════════════════════════
	     QUICK START
	     ═══════════════════════════════════════════════════════════════════════ -->
	<section class="mb-12" id="quick-start">
		<h1 class="mb-1 font-serif text-2xl font-semibold text-ink dark:text-dark-ink">Quick start</h1>
		<p class="mb-6 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Everything you need to be productive in five minutes.
		</p>

		<!-- 5-step workflow -->
		<div class="mb-6 grid gap-3 sm:grid-cols-5">
			{#each [{ n: '1', label: 'Create a project', sub: 'Projects → New project' }, { n: '2', label: 'Add documents', sub: 'Write in Markdown' }, { n: '3', label: 'Build bibliography', sub: 'Project → Bib tab' }, { n: '4', label: 'Cite & link', sub: '[[@key]]  [[Title]]' }, { n: '5', label: 'Commit & export', sub: 'Version saved · PDF / LaTeX' }] as step}
				<div
					class="flex flex-col gap-1 rounded-xl border border-paper-border bg-paper px-3 py-3 dark:border-dark-paper-border dark:bg-dark-paper"
				>
					<span class="font-mono text-xs font-semibold text-accent">{step.n}</span>
					<p class="font-sans text-xs font-semibold text-ink dark:text-dark-ink">{step.label}</p>
					<p class="font-mono text-[10px] text-ink-faint dark:text-dark-ink-faint">{step.sub}</p>
				</div>
			{/each}
		</div>

		<!-- Syntax cheat sheet -->
		<div
			class="overflow-hidden rounded-xl border border-paper-border dark:border-dark-paper-border"
		>
			<div
				class="border-b border-paper-border bg-paper-ui px-4 py-2 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<p
					class="font-sans text-xs font-semibold tracking-wide text-ink-muted uppercase dark:text-dark-ink-muted"
				>
					Editor syntax — most used
				</p>
			</div>
			<div class="grid sm:grid-cols-2">
				<div class="divide-y divide-paper-border dark:divide-dark-paper-border">
					{#each [{ write: '**bold**  *italic*', result: 'bold / italic' }, { write: '# Title  ## Section', result: 'headings' }, { write: '> text', result: 'block quote' }, { write: '- item  1. item', result: 'lists' }, { write: '[[@darwin1859]]', result: 'bibliographic citation' }] as row}
						<div class="flex items-center gap-3 px-4 py-2.5">
							<code
								class="shrink-0 rounded bg-paper-ui px-1.5 py-0.5 font-mono text-[11px] text-ink dark:bg-dark-paper-ui dark:text-dark-ink"
								>{row.write}</code
							>
							<span class="font-sans text-xs text-ink-muted dark:text-dark-ink-muted"
								>{row.result}</span
							>
						</div>
					{/each}
				</div>
				<div
					class="divide-y divide-paper-border border-t border-paper-border sm:border-t-0 sm:border-l dark:divide-dark-paper-border dark:border-dark-paper-border"
				>
					{#each [{ write: '$E=mc^2$  $$...$$', result: 'inline / block math' }, { write: '[[Title]]', result: 'wikilink to a document' }, { write: '[[doc:  [[#  [[^  [[!  [[p', result: '[[  autocomplete triggers' }, { write: '[^1]  [^1]: note', result: 'footnote mark / definition' }, { write: '```vega-lite', result: 'interactive chart' }] as row}
						<div class="flex items-center gap-3 px-4 py-2.5">
							<code
								class="shrink-0 rounded bg-paper-ui px-1.5 py-0.5 font-mono text-[11px] text-ink dark:bg-dark-paper-ui dark:text-dark-ink"
								>{row.write}</code
							>
							<span class="font-sans text-xs text-ink-muted dark:text-dark-ink-muted"
								>{row.result}</span
							>
						</div>
					{/each}
				</div>
			</div>
		</div>

		<Callout
			>Draft saves automatically every 30 s. <strong>Save</strong> forces it immediately. Use
			<strong>Commit</strong> to create a named restore point — only commits update wikilink indexes and
			version history.</Callout
		>
	</section>

	<!-- ═══════════════════════════════════════════════════════════════════════
	     DOCUMENT TYPES
	     ═══════════════════════════════════════════════════════════════════════ -->
	<section class="mb-12" id="document-types">
		<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">
			Document types
		</h2>
		<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Each type has its own help page with a full example and a one-click sample project.
		</p>
		<div class="grid gap-3 sm:grid-cols-2">
			{#each [{ href: '/help/notes', label: 'Notes', tagline: 'Annotations, reading notes, and ideas in progress.' }, { href: '/help/book', label: 'Book', tagline: 'Multi-chapter document with cover page, TOC, and numbered chapters.' }] as item}
				<a
					href={item.href}
					class="group flex flex-col gap-1 rounded-xl border border-paper-border bg-paper px-4 py-3 transition-colors hover:border-accent/40 dark:border-dark-paper-border dark:bg-dark-paper"
				>
					<span
						class="font-sans text-sm font-semibold text-ink group-hover:text-accent dark:text-dark-ink"
						>{item.label} →</span
					>
					<span class="font-sans text-xs text-ink-muted dark:text-dark-ink-muted"
						>{item.tagline}</span
					>
				</a>
			{/each}
		</div>
	</section>

	<!-- ═══════════════════════════════════════════════════════════════════════
	     TABLE OF CONTENTS
	     ═══════════════════════════════════════════════════════════════════════ -->
	<section class="mb-12">
		<h2 class="mb-4 font-serif text-lg font-semibold text-ink dark:text-dark-ink">
			Complete guide
		</h2>
		<div
			class="grid gap-1 rounded-xl border border-paper-border bg-paper px-5 py-4 sm:grid-cols-2 dark:border-dark-paper-border dark:bg-dark-paper"
		>
			{#each [{ href: '#projects', label: 'Projects & workspaces' }, { href: '#bibliography', label: 'Bibliography' }, { href: '#editor', label: 'Documents & editor' }, { href: '#formatting', label: '↳ Basic formatting' }, { href: '#citations', label: '↳ Bibliographic citations' }, { href: '#math', label: '↳ Mathematics & formal logic' }, { href: '#wikilinks', label: '↳ Wikilinks' }, { href: '#autocomplete', label: '↳ [[ autocomplete' }, { href: '#footnotes', label: '↳ Footnotes' }, { href: '#callouts', label: '↳ Callout blocks' }, { href: '#photos', label: '↳ Photos' }, { href: '#charts', label: '↳ Vega-Lite charts' }, { href: '#export', label: '↳ Export' }, { href: '#versions', label: 'Version history' }, { href: '/help/ai', label: 'AI assistant →' }, { href: '#collaboration', label: 'Collaboration' }, { href: '#explore', label: 'Explore' }, { href: '#settings', label: 'Settings' }, { href: '#tips', label: 'Tips' }] as item}
				<a
					href={item.href}
					class="block font-sans text-sm text-accent decoration-dotted underline-offset-2 hover:underline"
					>{item.label}</a
				>
			{/each}
		</div>
	</section>

	<!-- ═══════════════════════════════════════════════════════════════════════
	     PROJECTS
	     ═══════════════════════════════════════════════════════════════════════ -->
	<section class="mb-10" id="projects">
		<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">
			Projects & workspaces
		</h2>
		<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Projects are the top-level container. Everything — documents, bibliography, photos, AI context
			— lives inside a project.
		</p>
		<div class="space-y-3">
			<div
				class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<p class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">
					Personal vs. organisation
				</p>
				<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					Personal projects are visible only to you and your collaborators. Organisation projects
					are shared across all org members. Switch workspace from the navbar dropdown.
				</p>
			</div>
			<div
				class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<p class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">Import / Export</p>
				<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					Use <strong>Import</strong> on the projects page to restore a
					<code class="font-mono">.scholio</code>
					or <code class="font-mono">.zip</code> backup. Use the project menu →
					<strong>Export</strong> to download a full archive with all documents and bibliography.
				</p>
			</div>
			<div
				class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<p class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">Project tabs</p>
				<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					Each project has: <strong>Documents</strong>, <strong>Bib</strong> (bibliography),
					<strong>Photos</strong>, <strong>Search</strong> (semantic), <strong>AI</strong>
					(assistant), <strong>Notebooks</strong> (Jupyter), <strong>Requirements</strong>, and
					<strong>Review</strong> (open comments).
				</p>
			</div>
		</div>
	</section>

	<!-- ═══════════════════════════════════════════════════════════════════════
	     BIBLIOGRAPHY
	     ═══════════════════════════════════════════════════════════════════════ -->
	<section class="mb-10" id="bibliography">
		<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">Bibliography</h2>
		<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Each project has its own bibliography (<strong>Bib</strong> tab). There is also a global
			bibliography (<strong>/bib</strong> in the sidebar) shared across all your projects.
		</p>
		<div class="space-y-3">
			<div
				class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<p class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">Add references</p>
				<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					Four methods: <strong>manual form</strong>, <strong>DOI lookup</strong> (auto-fills all
					metadata), <strong>URL → AI</strong> (extracts metadata from any webpage using your AI
					model), or <strong>Import .bib</strong> (paste BibTeX or load a file). You can also import references
					from another project.
				</p>
			</div>
			<div
				class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<p class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">
					Semantic Scholar search
				</p>
				<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					Click <strong>Search paper</strong> to search the Semantic Scholar database by title, author
					or keywords. Selecting a result adds the full reference automatically, including open-access
					PDF when available.
				</p>
			</div>
			<div
				class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<p class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">Reading notes</p>
				<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					Each reference can have a linked notes document. Click the notebook icon on a reference to
					open or create it. The document is stored in the project like any other.
				</p>
			</div>
			<div
				class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<p class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">Citation styles</p>
				<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					Switch between <strong>APA 7</strong>, <strong>IEEE</strong>, <strong>Vancouver</strong>,
					<strong>Chicago</strong>, <strong>MLA</strong>, and several theology-specific styles (SBL,
					Turabian, ATLA…) from the bibliography page. The choice also affects how citations render
					in the editor preview.
				</p>
			</div>
		</div>
		<Callout
			>URL → AI requires an AI API key configured in <strong>Settings → AI Assistant</strong
			>.</Callout
		>
	</section>

	<!-- ═══════════════════════════════════════════════════════════════════════
	     EDITOR
	     ═══════════════════════════════════════════════════════════════════════ -->
	<section class="mb-6" id="editor">
		<h2 class="font-serif text-xl font-semibold text-ink dark:text-dark-ink">Documents & editor</h2>
		<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Standard Markdown with custom extensions for citations, math, wikilinks and charts.
		</p>
	</section>

	<!-- Basic formatting -->
	<section class="mb-10" id="formatting">
		<h3 class="mb-4 font-serif text-base font-semibold text-ink dark:text-dark-ink">
			Basic formatting
		</h3>
		<div
			class="overflow-hidden rounded-xl border border-paper-border dark:border-dark-paper-border"
		>
			<table class="w-full font-sans text-sm">
				<thead>
					<tr
						class="border-b border-paper-border bg-paper-ui dark:border-dark-paper-border dark:bg-dark-paper-ui"
					>
						<th class="px-4 py-2.5 text-left font-medium text-ink-muted dark:text-dark-ink-muted"
							>Write</th
						>
						<th class="px-4 py-2.5 text-left font-medium text-ink-muted dark:text-dark-ink-muted"
							>Result</th
						>
					</tr>
				</thead>
				<tbody class="divide-y divide-paper-border dark:divide-dark-paper-border">
					<tr>
						<td class="px-4 py-3"
							><code
								class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs dark:bg-dark-paper-ui"
								># Title</code
							></td
						>
						<td class="px-4 py-3 font-serif text-lg font-semibold text-ink dark:text-dark-ink"
							>Title (level 1)</td
						>
					</tr>
					<tr>
						<td class="px-4 py-3"
							><code
								class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs dark:bg-dark-paper-ui"
								>## Section</code
							></td
						>
						<td class="px-4 py-3 font-serif text-base font-semibold text-ink dark:text-dark-ink"
							>Section (level 2)</td
						>
					</tr>
					<tr>
						<td class="px-4 py-3"
							><code
								class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs dark:bg-dark-paper-ui"
								>**bold**</code
							></td
						>
						<td class="px-4 py-3 font-sans text-ink dark:text-dark-ink"><strong>bold</strong></td>
					</tr>
					<tr>
						<td class="px-4 py-3"
							><code
								class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs dark:bg-dark-paper-ui"
								>*italic*</code
							></td
						>
						<td class="px-4 py-3 font-sans text-ink italic dark:text-dark-ink">italic</td>
					</tr>
					<tr>
						<td class="px-4 py-3"
							><code
								class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs dark:bg-dark-paper-ui"
								>`code`</code
							></td
						>
						<td class="px-4 py-3"
							><code
								class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs text-ink dark:bg-dark-paper-ui dark:text-dark-ink"
								>code</code
							></td
						>
					</tr>
					<tr>
						<td class="px-4 py-3"
							><code
								class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs dark:bg-dark-paper-ui"
								>&gt; quote</code
							></td
						>
						<td
							class="border-l-2 border-accent px-4 py-3 pl-3 font-sans text-ink-muted italic dark:text-dark-ink-muted"
							>block quote</td
						>
					</tr>
					<tr>
						<td class="px-4 py-3"
							><code
								class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs dark:bg-dark-paper-ui"
								>- item</code
							></td
						>
						<td class="px-4 py-3 font-sans text-ink dark:text-dark-ink">• item (unordered list)</td>
					</tr>
					<tr>
						<td class="px-4 py-3"
							><code
								class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs dark:bg-dark-paper-ui"
								>1. item</code
							></td
						>
						<td class="px-4 py-3 font-sans text-ink dark:text-dark-ink">1. item (ordered list)</td>
					</tr>
					<tr>
						<td class="px-4 py-3"
							><code
								class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs dark:bg-dark-paper-ui"
								>[text](url)</code
							></td
						>
						<td class="px-4 py-3 font-sans text-accent underline">link</td>
					</tr>
					<tr>
						<td class="px-4 py-3"
							><code
								class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs dark:bg-dark-paper-ui"
								>---</code
							></td
						>
						<td class="px-4 py-3"
							><hr class="border-paper-border dark:border-dark-paper-border" /></td
						>
					</tr>
				</tbody>
			</table>
		</div>
	</section>

	<!-- Citations -->
	<section class="mb-10" id="citations">
		<h3 class="mb-1 font-serif text-base font-semibold text-ink dark:text-dark-ink">
			Bibliographic citations
		</h3>
		<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			References are managed in the <strong>Bib</strong> tab of each project. Once added, cite them by
			key in any document.
		</p>
		<div class="space-y-3">
			<div
				class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<p class="font-mono text-sm text-ink dark:text-dark-ink">
					<span class="text-accent">[[@darwin1859]]</span>
				</p>
				<p class="mt-1 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					Single citation — renders as "(Darwin, 1859)" in APA or "[1]" in IEEE/Vancouver
				</p>
			</div>
			<div
				class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<p class="font-mono text-sm text-ink dark:text-dark-ink">
					<span class="text-accent">[[@dawkins1976; @gould1979]]</span>
				</p>
				<p class="mt-1 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					Multiple citations separated by semicolons
				</p>
			</div>
		</div>
		<Callout
			>Use the <code class="rounded bg-paper-ui px-1 font-mono dark:bg-dark-paper-ui"
				>[[@cite]]</code
			> button in the editor toolbar to search and insert references without typing the key manually.
			The bibliography is generated automatically at the end of the document in the selected style (APA
			7, IEEE, Vancouver…).</Callout
		>
	</section>

	<!-- Math & logic -->
	<section class="mb-10" id="math">
		<h3 class="mb-1 font-serif text-base font-semibold text-ink dark:text-dark-ink">
			Mathematics & formal logic
		</h3>
		<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Rendered with KaTeX. Uses standard LaTeX syntax — inline with <code
				class="rounded bg-paper-ui px-1 font-mono text-xs dark:bg-dark-paper-ui">$...$</code
			>, block with
			<code class="rounded bg-paper-ui px-1 font-mono text-xs dark:bg-dark-paper-ui">$$...$$</code>.
		</p>
		<div class="space-y-3">
			<div
				class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<p class="font-mono text-sm text-ink dark:text-dark-ink">
					The formula <span class="text-accent">$E = mc^2$</span> describes...
				</p>
				<p class="mt-1 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					Inline math — within the text
				</p>
			</div>
			<div
				class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<p class="font-mono text-sm text-ink dark:text-dark-ink">
					<span class="text-accent">$$</span><br />H = -\sum_&#123;i&#125; p_i \log p_i<br /><span
						class="text-accent">$$</span
					>
				</p>
				<p class="mt-1 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					Block math — centered on its own line
				</p>
			</div>
		</div>
		<div
			class="mt-4 overflow-hidden rounded-xl border border-paper-border dark:border-dark-paper-border"
		>
			<table class="w-full font-sans text-sm">
				<thead>
					<tr
						class="border-b border-paper-border bg-paper-ui dark:border-dark-paper-border dark:bg-dark-paper-ui"
					>
						<th class="px-4 py-2.5 text-left font-medium text-ink-muted dark:text-dark-ink-muted"
							>Write</th
						>
						<th class="px-4 py-2.5 text-left font-medium text-ink-muted dark:text-dark-ink-muted"
							>Symbol</th
						>
						<th class="px-4 py-2.5 text-left font-medium text-ink-muted dark:text-dark-ink-muted"
							>Name</th
						>
					</tr>
				</thead>
				<tbody class="divide-y divide-paper-border dark:divide-dark-paper-border">
					{#each [{ write: '$\\neg p$', sym: '¬p', name: 'Negation' }, { write: '$p \\land q$', sym: 'p ∧ q', name: 'Conjunction' }, { write: '$p \\lor q$', sym: 'p ∨ q', name: 'Disjunction' }, { write: '$p \\rightarrow q$', sym: 'p → q', name: 'Implication' }, { write: '$p \\leftrightarrow q$', sym: 'p ↔ q', name: 'Biconditional' }, { write: '$\\forall x$', sym: '∀x', name: 'Universal quantifier' }, { write: '$\\exists x$', sym: '∃x', name: 'Existential quantifier' }, { write: '$\\therefore$', sym: '∴', name: 'Therefore' }, { write: '$\\bot$', sym: '⊥', name: 'Contradiction' }, { write: '$\\top$', sym: '⊤', name: 'Tautology' }, { write: '$x \\in A$', sym: 'x ∈ A', name: 'Membership' }, { write: '$A \\subseteq B$', sym: 'A ⊆ B', name: 'Subset' }] as row}
						<tr>
							<td class="px-4 py-2.5"
								><code
									class="rounded bg-paper-ui px-1.5 py-0.5 font-mono text-xs dark:bg-dark-paper-ui"
									>{row.write}</code
								></td
							>
							<td class="px-4 py-2.5 font-serif text-ink dark:text-dark-ink">{row.sym}</td>
							<td class="px-4 py-2.5 font-sans text-ink-muted dark:text-dark-ink-muted"
								>{row.name}</td
							>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<!-- Wikilinks -->
	<section class="mb-10" id="wikilinks">
		<h3 class="mb-1 font-serif text-base font-semibold text-ink dark:text-dark-ink">Wikilinks</h3>
		<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Link documents to each other. In the preview they become navigable links.
		</p>
		<div class="space-y-3">
			<div
				class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<p class="font-mono text-sm text-ink dark:text-dark-ink">
					<span class="text-accent">[[Introduction]]</span>
				</p>
				<p class="mt-1 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					Link to a document in the <strong>same project</strong> by exact title.
				</p>
			</div>
			<div
				class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<p class="font-mono text-sm text-ink dark:text-dark-ink">
					<span class="text-accent">[[Introduction:a3f9b2c1]]</span>
				</p>
				<p class="mt-1 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					Link to a <strong>public document from another user</strong>. The hash is the first 8
					characters of the document ID — copy it from the external context picker using the
					<code class="font-mono">[[·]]</code> button.
				</p>
			</div>
		</div>
		<Callout
			>Backlinks (documents that mention you) appear in the "Mentioned in" panel of the editor. The
			link index is updated on <strong>commit</strong>, not on draft save.</Callout
		>
	</section>

	<!-- [[ autocomplete -->
	<section class="mb-10" id="autocomplete">
		<h3 class="mb-1 font-serif text-base font-semibold text-ink dark:text-dark-ink">
			Editor autocomplete (<code class="font-mono text-sm">[[</code>)
		</h3>
		<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Type <code class="rounded bg-paper-ui px-1 font-mono text-xs dark:bg-dark-paper-ui">[[</code> followed
			by a prefix to open a specific autocomplete panel.
		</p>
		<div class="space-y-3">
			{#each [{ trigger: '[[doc:', example: '[[doc:Introduction → [[doc:<id>|Introduction]]', desc: 'Search a document in the project by title.' }, { trigger: '[[@', example: '[[@darwin1859]]', desc: 'Insert a bibliographic citation. Autocompletes from project references.' }, { trigger: '[[#', example: '[[#Methodology]]', desc: 'Internal anchor link to a heading in the current document.' }, { trigger: '[[^', example: '[[^]] → inserts [^1] + definition at end', desc: 'Insert a numbered footnote with its definition added automatically.' }, { trigger: '[[p', example: '[[pKarl → [[person:Karl Barth]]', desc: 'Search a person by name using AI. Renders with a dotted underline; hover shows a brief author card (dates, field, origin).' }, { trigger: '[[index:persons]]', example: '[[index:persons]] → onomastic index', desc: 'Type this tag anywhere in the document to insert an auto-generated alphabetical index of all [[person:Name]] tags used in that document, with links back to their first occurrence.' }, { trigger: '[[!', example: '[[!whiteboard → ![caption](/api/photos/…)', desc: 'Search project photos by filename or description. Selecting one embeds the image with a permanent proxy URL.' }] as item}
				<div
					class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
				>
					<p class="font-mono text-sm text-ink dark:text-dark-ink">
						<span class="text-accent">{item.trigger}</span>
						<span class="text-xs text-ink-faint dark:text-dark-ink-faint"> — {item.example}</span>
					</p>
					<p class="mt-1 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">{item.desc}</p>
				</div>
			{/each}
		</div>
	</section>

	<!-- Footnotes -->
	<section class="mb-10" id="footnotes">
		<h3 class="mb-1 font-serif text-base font-semibold text-ink dark:text-dark-ink">Footnotes</h3>
		<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Numbered footnotes auto-rendered at the end of the document with return links.
		</p>
		<div class="space-y-3">
			<div
				class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<p class="font-mono text-sm text-ink dark:text-dark-ink">
					The theory was proposed by Kuhn<span class="text-accent">[^1]</span> and later expanded<span
						class="text-accent">[^kuhn]</span
					>.
				</p>
				<p class="mt-1 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					Mark in the text — key can be a number or a word. Renders as a numbered superscript.
				</p>
			</div>
			<div
				class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<p class="font-mono text-sm text-ink dark:text-dark-ink">
					<span class="text-accent">[^1]</span>: Kuhn, T. S. (1962).
					<em>The Structure of Scientific Revolutions</em>.<br />
					<span class="text-accent">[^kuhn]</span>: Feyerabend, P. (1975). <em>Against Method</em>.
				</p>
				<p class="mt-1 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					Note definition — can go anywhere, usually at the end.
				</p>
			</div>
		</div>
		<Callout
			>Use citations <code class="rounded bg-paper-ui px-1 font-mono dark:bg-dark-paper-ui"
				>[[@key]]</code
			> for formal references that appear in the bibliography. Use footnotes for clarifications, comments
			or informal references.</Callout
		>
	</section>

	<!-- Callout blocks -->
	<section class="mb-10" id="callouts">
		<h3 class="mb-1 font-serif text-base font-semibold text-ink dark:text-dark-ink">
			Callout blocks
		</h3>
		<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Highlight important passages with a typed callout. Use them to flag warnings, tips or
			precautions — the same way technical books mark margin notes.
		</p>
		<div class="space-y-3">
			{#each [{ type: 'note', label: 'Nota', color: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/40', border: 'border-blue-200 dark:border-blue-800' }, { type: 'warning', label: 'Atención', color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/40', border: 'border-amber-200 dark:border-amber-800' }, { type: 'tip', label: 'Consejo', color: 'text-green-700 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-950/40', border: 'border-green-200 dark:border-green-800' }, { type: 'caution', label: 'Precaución', color: 'text-red-700 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/40', border: 'border-red-200 dark:border-red-800' }] as item}
				<div
					class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
				>
					<div class="flex items-start gap-4">
						<div class="min-w-0 flex-1">
							<p class="font-mono text-sm text-ink dark:text-dark-ink">
								<span class="text-accent">&gt; [!{item.type}]</span><br />
								<span class="text-ink-muted dark:text-dark-ink-muted"
									>&gt; Text of the callout.</span
								>
							</p>
							<p class="mt-1 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
								Type <code class="rounded bg-paper-ui px-1 font-mono dark:bg-dark-paper-ui"
									>/{item.type}</code
								> in the editor to open autocomplete and insert the template — no need to write the syntax
								by hand.
							</p>
						</div>
						<div class="shrink-0">
							<div
								class="rounded border-l-[3px] {item.border} {item.bg} px-3 py-1.5 font-sans text-xs {item.color}"
							>
								<span class="font-semibold">{item.label}:</span> Text of the callout.
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
		<Callout
			>Callouts are also exported correctly to PDF — each type renders as a shaded block with a
			coloured left border.</Callout
		>
	</section>

	<!-- Photos -->
	<section class="mb-10" id="photos">
		<h3 class="mb-1 font-serif text-base font-semibold text-ink dark:text-dark-ink">Photos</h3>
		<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Upload photos of whiteboards, sketches or field notes in the <strong>Photos</strong> tab of a project.
		</p>
		<div class="space-y-3">
			<div
				class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<p class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">
					Embed in a document
				</p>
				<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					Type <code class="rounded bg-paper-ui px-1 font-mono dark:bg-dark-paper-ui">[[!</code> in
					the editor and start typing the filename or description. Select a photo to insert
					<code class="font-mono">![caption](/api/photos/id)</code>.
				</p>
			</div>
			<div
				class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<p class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">Copy as Markdown</p>
				<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					Hover a photo in the gallery and click the copy icon to get the <code class="font-mono"
						>![…](…)</code
					> snippet ready to paste.
				</p>
			</div>
			<div
				class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<p class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">Permanent URLs</p>
				<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					Images are served via an authenticated proxy — links embedded in documents never expire.
				</p>
			</div>
		</div>
		<Callout
			>Photos require S3-compatible storage configured in <strong>Settings → Storage</strong>. For
			local development, point it at a MinIO instance.</Callout
		>
	</section>

	<!-- Vega-Lite -->
	<section class="mb-10" id="charts">
		<h3 class="mb-1 font-serif text-base font-semibold text-ink dark:text-dark-ink">
			Vega-Lite charts
		</h3>
		<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Code blocks with language <code
				class="rounded bg-paper-ui px-1 font-mono text-xs dark:bg-dark-paper-ui">vega-lite</code
			> render as interactive charts in the preview.
		</p>
		<div
			class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
		>
			<pre class="overflow-x-auto font-mono text-xs text-ink dark:text-dark-ink"><code
					>```vega-lite
&#123;
  "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
  "data": &#123; "$ref": "dataset:results" &#125;,
  "mark": "bar",
  "encoding": &#123;
    "x": &#123; "field": "group", "type": "nominal" &#125;,
    "y": &#123; "field": "value", "type": "quantitative" &#125;
  &#125;
&#125;
```</code
				></pre>
		</div>
		<Callout
			><code class="rounded bg-paper-ui px-1 font-mono dark:bg-dark-paper-ui"
				>"$ref": "dataset:name"</code
			>
			references a dataset uploaded to the project. You can also put the data directly in the
			<code class="font-mono">"data"</code> field.</Callout
		>
	</section>

	<!-- Export -->
	<section class="mb-10" id="export">
		<h3 class="mb-1 font-serif text-base font-semibold text-ink dark:text-dark-ink">Export</h3>
		<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			From the editor toolbar, the <strong>Export</strong> menu generates a file ready to compile or submit.
		</p>
		<div class="space-y-3">
			<div
				class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<p class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">
					PDF <code class="ml-1 font-mono text-xs text-ink-muted dark:text-dark-ink-muted"
						>.pdf</code
					>
				</p>
				<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					Generated server-side via Typst. Includes rendered citations and bibliography. Available
					directly from the editor.
				</p>
			</div>
			<div
				class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<p class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">
					LaTeX <code class="ml-1 font-mono text-xs text-ink-muted dark:text-dark-ink-muted"
						>.tex</code
					>
				</p>
				<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					Self-contained file with bibliography embedded via <code class="font-mono"
						>\begin&#123;filecontents*&#125;</code
					>. Compile with <code class="font-mono">pdflatex</code> +
					<code class="font-mono">bibtex</code>.
				</p>
			</div>
			<div
				class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<p class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">
					Typst <code class="ml-1 font-mono text-xs text-ink-muted dark:text-dark-ink-muted"
						>.typ</code
					>
				</p>
				<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					Self-contained file with bibliography embedded. Compile with <a
						href="https://typst.app"
						target="_blank"
						rel="noopener noreferrer"
						class="text-accent underline decoration-dotted">typst.app</a
					> or the Typst CLI.
				</p>
			</div>
		</div>
	</section>

	<!-- ═══════════════════════════════════════════════════════════════════════
	     VERSION HISTORY
	     ═══════════════════════════════════════════════════════════════════════ -->
	<section class="mb-10" id="versions">
		<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">
			Version history
		</h2>
		<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Scholio separates continuous saving from intentional versioning.
		</p>
		<div class="space-y-3">
			<div
				class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<p class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">Save (draft)</p>
				<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					Runs automatically every 30 seconds or when you click <strong>Save</strong>. Drafts are
					not versioned — they overwrite the previous draft.
				</p>
			</div>
			<div
				class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<p class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">Commit</p>
				<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					Creates a named snapshot in the version history. Commits also update the wikilink index
					and the "Mentioned in" backlink panel. Add an optional message to describe the change.
				</p>
			</div>
			<div
				class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<p class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">History & diff</p>
				<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					Open the <strong>History</strong> panel from the editor toolbar to browse all commits. Click
					any version to see a full diff against the current draft. You can restore any previous version
					from there.
				</p>
			</div>
		</div>
	</section>

	<!-- ═══════════════════════════════════════════════════════════════════════
	     AI ASSISTANT
	     ═══════════════════════════════════════════════════════════════════════ -->
	<section class="mb-10" id="ai">
		<div class="mb-4 flex items-start justify-between gap-4">
			<div>
				<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">
					AI assistant
				</h2>
				<p class="font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
					The AI assistant in the <strong>AI</strong> tab of each project has access to your documents
					and bibliography. It is not a generic chatbot — it works with your own content.
				</p>
			</div>
			<a
				href="/help/ai"
				class="shrink-0 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 font-sans text-xs font-semibold text-accent transition-colors hover:bg-accent/10 dark:border-accent/20 dark:bg-accent/5"
			>
				Full AI guide →
			</a>
		</div>
		<div class="space-y-3">
			<div
				class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<p class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">Setup</p>
				<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					Go to <strong>Settings → AI Assistant</strong> and add an OpenRouter API key. OpenRouter gives
					you access to many models (Claude, GPT-4, Llama…) from a single key. You can also configure
					task-specific models: one for summarising, another for code, etc.
				</p>
			</div>
			<div
				class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<p class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">Context</p>
				<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					The assistant automatically uses all documents in the project as context. You can also add
					public documents from other users as external context using the context picker in the AI
					tab.
				</p>
			</div>
			<div
				class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<p class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">
					In-editor assistant
				</p>
				<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					Select text in the editor and click the AI button in the toolbar to ask questions or
					request rewrites about a specific passage, without leaving the document.
				</p>
			</div>
		</div>
		<Callout
			>Your documents are never sent to AI providers without an active API key. See <strong
				>Settings → AI Assistant</strong
			> for the full model configuration.</Callout
		>
	</section>

	<!-- ═══════════════════════════════════════════════════════════════════════
	     COLLABORATION
	     ═══════════════════════════════════════════════════════════════════════ -->
	<section class="mb-10" id="collaboration">
		<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">Collaboration</h2>
		<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Invite collaborators to a specific project or create an organisation to share a workspace.
		</p>
		<div class="space-y-3">
			<div
				class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<p class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">
					Project invitations
				</p>
				<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					From a project's settings, invite collaborators by email. Roles: <strong>reader</strong>
					(view only), <strong>writer</strong> (can edit), <strong>owner</strong> (full control).
					Pending invitations appear in <strong>Network</strong>.
				</p>
			</div>
			<div
				class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<p class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">Organisations</p>
				<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					Create an organisation in <strong>Settings → Organisations</strong>. All projects in an
					org workspace are visible to all org members. Switch between personal and org workspace
					from the navbar dropdown.
				</p>
			</div>
			<div
				class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<p class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">Comments & review</p>
				<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					Collaborators can leave inline comments anchored to text selections. Open issues are
					collected in the <strong>Review</strong> tab of the project so nothing gets lost.
				</p>
			</div>
			<div
				class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<p class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">Public documents</p>
				<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					Mark a document as <strong>Public</strong> from the editor toolbar. Public documents are
					discoverable in <strong>Explore</strong> and can be added as AI context by other users.
				</p>
			</div>
		</div>
	</section>

	<!-- ═══════════════════════════════════════════════════════════════════════
	     EXPLORE
	     ═══════════════════════════════════════════════════════════════════════ -->
	<section class="mb-10" id="explore">
		<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">Explore</h2>
		<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			<strong>Explore</strong> shows all public documents across all users. Use it to discover references,
			read other researchers' work, or find context to add to your AI assistant.
		</p>
		<div
			class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
		>
			<p class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">Add as AI context</p>
			<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
				From any public document you can click <strong>Add to project context</strong> to make it available
				to your AI assistant. The document is referenced, not copied — it updates when the author commits
				changes.
			</p>
		</div>
	</section>

	<!-- ═══════════════════════════════════════════════════════════════════════
	     SETTINGS
	     ═══════════════════════════════════════════════════════════════════════ -->
	<section class="mb-10" id="settings">
		<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">Settings</h2>
		<div class="space-y-3">
			<div
				class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<p class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">AI Assistant</p>
				<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					Add your OpenRouter API key and select models per task type (general assistant, summarise,
					code, embeddings…). Without a key, AI features (URL → AI, in-editor assistant, AI tab) are
					disabled.
				</p>
			</div>
			<div
				class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<p class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">Storage (S3)</p>
				<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					Configure an S3-compatible bucket (AWS S3, Cloudflare R2, MinIO…) to enable photo uploads
					and PDF snapshots. Without storage, the Photos section is unavailable.
				</p>
			</div>
			<div
				class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<p class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">API keys</p>
				<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					Generate personal API keys to access Scholio from external tools or scripts. Keys are
					scoped to your account and can be revoked at any time.
				</p>
			</div>
			<div
				class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<p class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">Appearance</p>
				<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					Choose a colour theme and toggle dark mode from the palette icon in the navbar. The
					preference is saved locally and persists across sessions.
				</p>
			</div>
		</div>
	</section>

	<!-- ═══════════════════════════════════════════════════════════════════════
	     TIPS
	     ═══════════════════════════════════════════════════════════════════════ -->
	<section id="tips">
		<h2 class="mb-4 font-serif text-lg font-semibold text-ink dark:text-dark-ink">Tips</h2>
		<ul class="space-y-2 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			<li class="flex gap-2">
				<span class="text-ink-faint dark:text-dark-ink-faint">—</span> The draft saves automatically
				every 30 seconds. Use <strong>Save</strong> to force it earlier.
			</li>
			<li class="flex gap-2">
				<span class="text-ink-faint dark:text-dark-ink-faint">—</span> <strong>Commit</strong> when you
				want a restore point. Only commits update the wikilink index and version history.
			</li>
			<li class="flex gap-2">
				<span class="text-ink-faint dark:text-dark-ink-faint">—</span> The <strong>preview</strong> renders
				citations, math, wikilinks and charts. The editor shows plain-text Markdown.
			</li>
			<li class="flex gap-2">
				<span class="text-ink-faint dark:text-dark-ink-faint">—</span> Mark a document as
				<strong>Public</strong> so other users can add it as AI context in their projects.
			</li>
			<li class="flex gap-2">
				<span class="text-ink-faint dark:text-dark-ink-faint">—</span> The AI assistant works best when
				there is plenty of content — add documents before asking complex questions.
			</li>
			<li class="flex gap-2">
				<span class="text-ink-faint dark:text-dark-ink-faint">—</span> Name quick-access projects
				with <code class="rounded bg-paper-ui px-1 font-mono dark:bg-dark-paper-ui">_quick</code> or
				<code class="rounded bg-paper-ui px-1 font-mono dark:bg-dark-paper-ui">_math</code> to make them
				appear first in the quick-note picker.
			</li>
			<li class="flex gap-2">
				<span class="text-ink-faint dark:text-dark-ink-faint">—</span> DOI lookup is the fastest way to
				add a reference — paste the DOI and all metadata is filled in automatically.
			</li>
		</ul>
	</section>
</div>
