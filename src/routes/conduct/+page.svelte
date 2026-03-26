<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<svelte:head>
	<title>Code of conduct · Scholio</title>
	<meta name="description" content="Usage rules and community guidelines for Scholio." />
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

	<h1 class="font-serif text-4xl font-semibold text-ink dark:text-dark-ink">Code of conduct</h1>

	<p class="mt-5 font-sans text-base leading-relaxed text-ink-muted dark:text-dark-ink-muted">
		Scholio is a platform for those who want to research, write and think rigorously — whether you are an academic
		researcher, student, journalist or simply someone with intellectual curiosity. Your institution
		or title do not matter: if you work with ideas and want to do it well, this is your place.
	</p>
	<p class="mt-3 font-sans text-base leading-relaxed text-ink-muted dark:text-dark-ink-muted">
		For it to work for everyone, there are some basic rules.
	</p>

	<hr class="my-10 border-paper-border dark:border-dark-paper-border" />

	<div class="flex flex-col gap-10">

		<section>
			<h2 class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">What we expect from you</h2>

			<div class="mt-6 flex flex-col gap-6">
				<div>
					<h3 class="font-sans text-sm font-semibold uppercase tracking-wide text-ink dark:text-dark-ink">Intellectual honesty</h3>
					<p class="mt-2 font-sans text-base leading-relaxed text-ink-muted dark:text-dark-ink-muted">
						The work you publish or share on Scholio is yours, or is correctly attributed to its authors. Do not use the platform to present others’ ideas as your own or to facilitate plagiarism.
					</p>
				</div>

				<div>
					<h3 class="font-sans text-sm font-semibold uppercase tracking-wide text-ink dark:text-dark-ink">Transparency with AI</h3>
					<p class="mt-2 font-sans text-base leading-relaxed text-ink-muted dark:text-dark-ink-muted">
						The Scholio assistant exists to help you research and write better, not to replace your thinking. If you use AI to generate or rephrase content in your documents, declare it — in the document itself or in the project metadata. The academic community is building norms around this; in the meantime, transparency is always the right answer.
					</p>
				</div>

				<div>
					<h3 class="font-sans text-sm font-semibold uppercase tracking-wide text-ink dark:text-dark-ink">Respect in collaboration</h3>
					<p class="mt-2 font-sans text-base leading-relaxed text-ink-muted dark:text-dark-ink-muted">
						Shared projects imply trust. Treat your collaborators’ work with the same care as your own. Disputes over authorship or access should be resolved between the people involved; if you need support, you can contact us.
					</p>
				</div>

				<div>
					<h3 class="font-sans text-sm font-semibold uppercase tracking-wide text-ink dark:text-dark-ink">Responsible content</h3>
					<p class="mt-2 font-sans text-base leading-relaxed text-ink-muted dark:text-dark-ink-muted">
						Do not upload copyrighted material without having the rights to do so. If your research involves personal data, make sure you have consent and comply with applicable regulations.
					</p>
				</div>

				<div>
					<h3 class="font-sans text-sm font-semibold uppercase tracking-wide text-ink dark:text-dark-ink">No malicious use</h3>
					<p class="mt-2 font-sans text-base leading-relaxed text-ink-muted dark:text-dark-ink-muted">
						Do not attempt to access projects or documents that are not yours. Do not use the AI assistant to try to extract information from other users. Do not use Scholio to distribute misinformation.
					</p>
				</div>
			</div>
		</section>

		<hr class="border-paper-border dark:border-dark-paper-border" />

		<section>
			<h2 class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">How we handle violations</h2>
			<p class="mt-3 font-sans text-base leading-relaxed text-ink-muted dark:text-dark-ink-muted">
				We believe in giving opportunities to correct. The usual process is:
			</p>

			<ol class="mt-5 flex flex-col gap-4">
				{#each [
					{ n: '1', label: 'First violation', desc: 'Email warning explaining what happened and what we expect.' },
					{ n: '2', label: 'Second violation', desc: 'Formal warning and temporary restriction of some features.' },
					{ n: '3', label: 'Third violation', desc: 'Account suspension.' }
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
				We reserve the right to skip this process in serious cases: unauthorized access to other users’ data, deliberate fraud or any activity that puts the platform or other users at risk.
			</p>
		</section>

		<hr class="border-paper-border dark:border-dark-paper-border" />

		<section>
			<h2 class="font-serif text-2xl font-semibold text-ink dark:text-dark-ink">A note on the spirit of these rules</h2>
			<p class="mt-3 font-sans text-base leading-relaxed text-ink-muted dark:text-dark-ink-muted">
				Scholio is born from the conviction that knowledge should be accessible to anyone who wants to work with it seriously. This code does not exist to create barriers, but to protect that spirit. If you are unsure whether something is right or wrong, the useful question is:
			<em>Would I be comfortable explaining what I am doing to my collaborators?</em>
			If the answer is yes, you are probably on the right track.
			</p>
			<p class="mt-4 font-sans text-base leading-relaxed text-ink-muted dark:text-dark-ink-muted">
				Questions or issues? Write to us at
				<a href="mailto:conduct@scholio.app" class="text-accent underline underline-offset-2">conduct@scholio.app</a>.
			</p>
		</section>

	</div>

	<p class="mt-16 font-sans text-xs text-ink-faint dark:text-dark-ink-faint">
		Last updated: March 2026
	</p>
</div>
