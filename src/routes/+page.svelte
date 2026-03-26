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
					About
				</a>
				<a href="/blog" class="font-sans text-sm text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink">
					Blog
				</a>
				<a href="/login" class="font-sans text-sm text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink">
					Sign in
				</a>
				<a href="#waitlist" class="rounded-lg bg-accent px-4 py-1.5 font-sans text-sm font-semibold text-white transition-opacity hover:opacity-90">
					Beta access
				</a>
			</div>
		</div>
	</header>

	<!-- ── Hero ─────────────────────────────────────────────────────────────── -->
	<section class="mx-auto max-w-3xl px-6 pb-20 pt-24 text-center">
		<p class="mb-4 font-sans text-xs font-semibold uppercase tracking-widest text-accent">
			Collaborative academic writing
		</p>
		<h1 class="font-serif text-5xl font-semibold leading-tight text-ink dark:text-dark-ink sm:text-6xl">
			The environment your<br/>research deserves
		</h1>
		<p class="mx-auto mt-6 max-w-xl font-sans text-lg leading-relaxed text-ink-muted dark:text-dark-ink-muted">
			Scholio combines a powerful Markdown editor, version control, role-based collaboration, automatic citations, and an AI assistant that knows your project — all in one place.
		</p>
		<div class="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
			<a href="#waitlist" class="rounded-lg bg-accent px-6 py-3 font-sans text-sm font-semibold text-white transition-opacity hover:opacity-90">
				Request beta access
			</a>
			<a href="/login" class="rounded-lg border border-paper-border px-6 py-3 font-sans text-sm text-ink-muted transition-colors hover:bg-paper hover:text-ink dark:border-dark-paper-border dark:text-dark-ink-muted dark:hover:bg-dark-paper">
				I already have an account
			</a>
		</div>
		<p class="mt-4 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
			Closed beta · Open source · No credit card
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
				<span class="ml-3 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">Impact of epistemic diversity in research teams.md</span>
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
			Live editor and preview · Citations, math, and footnotes rendered instantly
		</p>
	</section>

	<!-- ── Features ─────────────────────────────────────────────────────────── -->
	<section class="border-t border-paper-border py-24 dark:border-dark-paper-border">
		<div class="mx-auto max-w-5xl px-6">
			<h2 class="text-center font-serif text-3xl font-semibold text-ink dark:text-dark-ink">
				Everything you need to write seriously
			</h2>
			<p class="mx-auto mt-3 max-w-xl text-center font-sans text-base text-ink-muted dark:text-dark-ink-muted">
				Designed for researchers who publish — not for quick note-taking.
			</p>

			<div class="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">

				<!-- Citas -->
				<div class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper">
					<div class="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c5c3e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
						</svg>
					</div>
					<h3 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">Automatic citations and bibliography</h3>
					<p class="mt-2 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
						Manage your references with BibTeX. Cite with <code class="rounded bg-paper-ui px-1 font-mono text-xs dark:bg-dark-paper-ui">[@author2024]</code> and Scholio generates the bibliography in APA 7, IEEE or Vancouver at the end of the document.
					</p>
				</div>

				<!-- Control de versiones -->
				<div class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper">
					<div class="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c5c3e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
						</svg>
					</div>
					<h3 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">Version control for writing</h3>
					<p class="mt-2 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
						Create labeled snapshots at any time. Compare versions with visual diff, restore previous versions. Your research is never lost.
					</p>
				</div>

				<!-- Colaboración -->
				<div class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper">
					<div class="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c5c3e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
						</svg>
					</div>
					<h3 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">Role-based collaboration</h3>
					<p class="mt-2 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
						Invite co-authors, reviewers and commenters. Comments are anchored to the exact text. Threads resolve when the change is incorporated.
					</p>
				</div>

				<!-- IA -->
				<div class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper">
					<div class="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c5c3e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
						</svg>
					</div>
					<h3 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">AI assistant with real context</h3>
					<p class="mt-2 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
						The assistant reads all the documents in your project before responding. It's not a generic chatbot — it knows your methodology, your data and your argument.
					</p>
				</div>

				<!-- Matemáticas -->
				<div class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper">
					<div class="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c5c3e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>
						</svg>
					</div>
					<h3 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">Math and formal notation</h3>
					<p class="mt-2 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
						Integrated KaTeX for inline and block LaTeX equations. Logical, statistical, chemical notation — without leaving the editor. Also numbered footnotes.
					</p>
				</div>

				<!-- Exportación -->
				<div class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper">
					<div class="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c5c3e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
						</svg>
					</div>
					<h3 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">Export to LaTeX and Typst</h3>
					<p class="mt-2 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
						When the text is ready, export to <code class="rounded bg-paper-ui px-1 font-mono text-xs dark:bg-dark-paper-ui">.tex</code> or <code class="rounded bg-paper-ui px-1 font-mono text-xs dark:bg-dark-paper-ui">.typ</code> with the embedded bibliography. Ready to compile and submit to the journal.
					</p>
				</div>

				<!-- Gráficos -->
				<div class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper">
					<div class="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c5c3e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
						</svg>
					</div>
					<h3 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">Charts from your data</h3>
					<p class="mt-2 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
						Upload a CSV or JSON and generate Vega-Lite charts directly in the document. Data and visualization live together, versioned.
					</p>
				</div>

				<!-- Wikilinks -->
				<div class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper">
					<div class="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c5c3e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
						</svg>
					</div>
					<h3 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">Internal knowledge network</h3>
					<p class="mt-2 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
						Link documents with <code class="rounded bg-paper-ui px-1 font-mono text-xs dark:bg-dark-paper-ui">[[Title]]</code>. Backlinks update automatically. Your project becomes a navigable network of ideas.
					</p>
				</div>

				<!-- Open source -->
				<div class="rounded-xl border border-paper-border bg-paper p-6 dark:border-dark-paper-border dark:bg-dark-paper">
					<div class="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c5c3e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22"/>
						</svg>
					</div>
					<h3 class="font-serif text-base font-semibold text-ink dark:text-dark-ink">Open source and self-hostable</h3>
					<p class="mt-2 font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted">
						Scholio is open source. Your institution can deploy it on its own infrastructure. Your data is always yours.
					</p>
				</div>

			</div>
		</div>
	</section>

	<!-- ── Honestidad científica ─────────────────────────────────────────────── -->
	<section class="border-t border-paper-border py-20 dark:border-dark-paper-border">
		<div class="mx-auto max-w-2xl px-6 text-center">
			<p class="mb-3 font-sans text-xs font-semibold uppercase tracking-widest text-accent">Clear position</p>
			<h2 class="font-serif text-3xl font-semibold text-ink dark:text-dark-ink">
				Scholio does not write for you.
			</h2>
			<p class="mx-auto mt-5 font-sans text-base leading-relaxed text-ink-muted dark:text-dark-ink-muted">
				The AI assistant can help you search, structure and propose drafts. Everything it generates is marked as AI-originated and cannot become a final result directly. Authorship is yours or it means nothing.
			</p>
			<p class="mt-4 font-sans text-sm leading-relaxed text-ink-faint dark:text-dark-ink-faint">
				You can copy and paste. That is your decision. We do not facilitate it.
			</p>
		</div>
	</section>

	<!-- ── Para quién ────────────────────────────────────────────────────────── -->
	<section class="border-t border-paper-border py-24 dark:border-dark-paper-border">
		<div class="mx-auto max-w-5xl px-6">
			<h2 class="text-center font-serif text-3xl font-semibold text-ink dark:text-dark-ink">
				Made for those who publish
			</h2>
			<div class="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
				<div class="text-center">
					<div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
						<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7c5c3e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
						</svg>
					</div>
					<h3 class="font-serif text-sm font-semibold text-ink dark:text-dark-ink">Researchers</h3>
					<p class="mt-1 font-sans text-xs leading-relaxed text-ink-muted dark:text-dark-ink-muted">Articles, theses, technical reports with bibliographic rigor.</p>
				</div>
				<div class="text-center">
					<div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
						<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7c5c3e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
						</svg>
					</div>
					<h3 class="font-serif text-sm font-semibold text-ink dark:text-dark-ink">Clinicians and medical researchers</h3>
					<p class="mt-1 font-sans text-xs leading-relaxed text-ink-muted dark:text-dark-ink-muted">Case reports, systematic reviews, clinical guidelines.</p>
				</div>
				<div class="text-center">
					<div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
						<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7c5c3e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
						</svg>
					</div>
					<h3 class="font-serif text-sm font-semibold text-ink dark:text-dark-ink">University teams</h3>
					<p class="mt-1 font-sans text-xs leading-relaxed text-ink-muted dark:text-dark-ink-muted">Research groups with co-authors at different institutions.</p>
				</div>
				<div class="text-center">
					<div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
						<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7c5c3e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
						</svg>
					</div>
					<h3 class="font-serif text-sm font-semibold text-ink dark:text-dark-ink">PhD students and postdocs</h3>
					<p class="mt-1 font-sans text-xs leading-relaxed text-ink-muted dark:text-dark-ink-muted">Theses, conference papers, literature reviews.</p>
				</div>
			</div>
		</div>
	</section>

	<!-- ── Open source ───────────────────────────────────────────────────────── -->
	<section class="border-t border-paper-border py-16 dark:border-dark-paper-border">
		<div class="mx-auto max-w-2xl px-6 text-center">
			<p class="font-sans text-xs font-semibold uppercase tracking-widest text-ink-faint dark:text-dark-ink-faint">Philosophy</p>
			<h2 class="mt-3 font-serif text-2xl font-semibold text-ink dark:text-dark-ink">
				Science is open. So is the tool.
			</h2>
			<p class="mt-4 font-sans text-base leading-relaxed text-ink-muted dark:text-dark-ink-muted">
				Scholio is free software. The code is auditable, the platform is self-hostable, and the data is completely yours. Built for the academic community, not to extract value from it.
			</p>
		</div>
	</section>

	<!-- ── Waitlist ──────────────────────────────────────────────────────────── -->
	<section id="waitlist" class="border-t border-paper-border py-24 dark:border-dark-paper-border">
		<div class="mx-auto max-w-md px-6">
			<h2 class="text-center font-serif text-3xl font-semibold text-ink dark:text-dark-ink">
				Join the beta
			</h2>
			<p class="mt-3 text-center font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
				We are gradually opening access. Tell us a bit about your research.
			</p>

			{#if form?.success}
				<div class="mt-10 rounded-xl border border-green-200 bg-green-50 px-6 py-8 text-center dark:border-green-900/40 dark:bg-green-900/20">
					<p class="font-serif text-xl font-semibold text-green-800 dark:text-green-300">Request received</p>
					<p class="mt-2 font-sans text-sm text-green-700 dark:text-green-400">
						We'll notify you at <strong>{form.email}</strong> when your access is ready.
					</p>
				</div>
			{:else}
				<form method="POST" action="?/joinWaitlist" class="mt-8">
					<div class="flex flex-col gap-3">
						<input
							type="text"
							name="name"
							placeholder="Your name"
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
							placeholder="What kind of research do you work on? (optional)"
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
							Request access
						</button>
					</div>
				</form>
				<p class="mt-4 text-center font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
					Closed beta · No credit card · We notify by email
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
					Code of conduct
				</a>
				<a href="/login" class="font-sans text-xs text-ink-faint transition-colors hover:text-ink-muted dark:text-dark-ink-faint dark:hover:text-dark-ink-muted">
					Sign in
				</a>
			</div>
			<p class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
				Powered by Claude (Anthropic)
			</p>
		</div>
	</footer>

</div>
