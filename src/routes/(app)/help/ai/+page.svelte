<script lang="ts">
	import Callout from '$lib/components/ui/Callout.svelte';
</script>

<svelte:head>
	<title>AI Assistant — Scholio Help</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-6 py-10">
	<!-- Breadcrumb -->
	<nav
		class="mb-6 flex items-center gap-2 font-sans text-xs text-ink-faint dark:text-dark-ink-faint"
	>
		<a href="/help" class="text-accent underline-offset-2 hover:underline">Help</a>
		<span>/</span>
		<span class="text-ink-muted dark:text-dark-ink-muted">AI assistant</span>
	</nav>

	<!-- Header -->
	<div class="mb-10">
		<h1 class="font-serif text-3xl font-semibold text-ink dark:text-dark-ink">AI assistant</h1>
		<p
			class="mt-3 max-w-2xl font-sans text-sm leading-relaxed text-ink-muted dark:text-dark-ink-muted"
		>
			The AI assistant in Scholio is not a generic chatbot. It has direct access to your project —
			documents, bibliography, requirements and issues — and can read, search and propose changes
			without you having to copy-paste anything.
		</p>
	</div>

	<!-- Table of contents -->
	<div
		class="mb-12 rounded-xl border border-paper-border bg-paper px-5 py-4 dark:border-dark-paper-border dark:bg-dark-paper"
	>
		<p
			class="mb-3 font-sans text-xs font-semibold tracking-wide text-ink-muted uppercase dark:text-dark-ink-muted"
		>
			On this page
		</p>
		<div class="grid gap-1 sm:grid-cols-2">
			{#each [{ href: '#architecture', label: 'Architecture' }, { href: '#setup', label: 'Setup & API key' }, { href: '#agent-tools', label: 'Agent tools (conversational)' }, { href: '#read-tools', label: '↳ Read tools' }, { href: '#write-tools', label: '↳ Write tools (with confirmation)' }, { href: '#editor-tools', label: 'Editor tools (inline)' }, { href: '#task-tools', label: 'Task-based features' }, { href: '#models', label: 'Supported models' }, { href: '#tips', label: 'Tips' }] as item}
				<a
					href={item.href}
					class="block font-sans text-sm text-accent decoration-dotted underline-offset-2 hover:underline"
					>{item.label}</a
				>
			{/each}
		</div>
	</div>

	<!-- ═══════════════════════════════════════════════════════════════════════
	     ARCHITECTURE
	     ═══════════════════════════════════════════════════════════════════════ -->
	<section class="mb-12" id="architecture">
		<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">Architecture</h2>
		<p class="mb-6 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			The AI layer has two distinct modes that serve different purposes.
		</p>

		<!-- Architecture diagram -->
		<div
			class="overflow-hidden rounded-xl border border-paper-border dark:border-dark-paper-border"
		>
			<div
				class="border-b border-paper-border bg-paper-ui px-4 py-2 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<p
					class="font-sans text-xs font-semibold tracking-wide text-ink-muted uppercase dark:text-dark-ink-muted"
				>
					System overview
				</p>
			</div>
			<div class="bg-paper p-6 dark:bg-dark-paper">
				<div class="grid gap-4 sm:grid-cols-2">
					<!-- Conversational layer -->
					<div
						class="rounded-xl border-2 border-accent/30 bg-accent/5 p-4 dark:border-accent/20 dark:bg-accent/5"
					>
						<div class="mb-3 flex items-center gap-2">
							<div class="h-2 w-2 rounded-full bg-accent"></div>
							<p class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">
								Conversational layer
							</p>
						</div>
						<p class="mb-3 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
							Multi-round agent loop with tool calling. The model decides which tools to call, calls
							them automatically, and iterates up to 5 rounds.
						</p>
						<div class="space-y-1.5">
							{#each ['AI tab → Chat', 'Editor → inline assistant'] as item}
								<div class="flex items-center gap-2">
									<span class="font-mono text-[10px] text-accent">→</span>
									<span class="font-sans text-xs text-ink-muted dark:text-dark-ink-muted"
										>{item}</span
									>
								</div>
							{/each}
						</div>
					</div>
					<!-- Task layer -->
					<div
						class="rounded-xl border-2 border-paper-border bg-paper-ui p-4 dark:border-dark-paper-border dark:bg-dark-paper-ui"
					>
						<div class="mb-3 flex items-center gap-2">
							<div class="h-2 w-2 rounded-full bg-ink-faint dark:bg-dark-ink-faint"></div>
							<p class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">Task layer</p>
						</div>
						<p class="mb-3 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
							Single-round, purpose-built operations. You trigger them explicitly; the model
							receives a fixed context and returns a structured result.
						</p>
						<div class="space-y-1.5">
							{#each ['Draft · Review · Requirements', 'Spell · Grammar · Summary', 'Bibliography extraction'] as item}
								<div class="flex items-center gap-2">
									<span class="font-mono text-[10px] text-ink-faint dark:text-dark-ink-faint"
										>→</span
									>
									<span class="font-sans text-xs text-ink-muted dark:text-dark-ink-muted"
										>{item}</span
									>
								</div>
							{/each}
						</div>
					</div>
				</div>

				<!-- Agent loop diagram -->
				<div class="mt-4">
					<p class="mb-3 font-sans text-xs font-semibold text-ink-muted dark:text-dark-ink-muted">
						Agent loop (conversational layer)
					</p>
					<div class="flex items-start gap-0">
						{#each [{ step: '1', label: 'Your message', sub: 'Sent to the model with full conversation history' }, { step: '2', label: 'Model decides', sub: 'Text reply OR one or more tool calls' }, { step: '3', label: 'Tools execute', sub: 'Read tools run immediately; write tools wait for confirmation' }, { step: '4', label: 'Results fed back', sub: 'Tool results appended to history, model continues' }, { step: '5', label: 'Reply or loop', sub: 'Repeats up to 5 rounds, then returns final answer' }] as node, i}
							<div class="flex flex-1 flex-col items-center">
								<div
									class="flex h-7 w-7 items-center justify-center rounded-full bg-accent font-mono text-xs font-semibold text-white"
								>
									{node.step}
								</div>
								<div class="mt-2 w-full px-1 text-center">
									<p class="font-sans text-[11px] font-semibold text-ink dark:text-dark-ink">
										{node.label}
									</p>
									<p
										class="mt-0.5 font-sans text-[10px] leading-tight text-ink-faint dark:text-dark-ink-faint"
									>
										{node.sub}
									</p>
								</div>
							</div>
							{#if i < 4}
								<div
									class="mt-3 shrink-0 font-mono text-xs text-ink-faint dark:text-dark-ink-faint"
								>
									→
								</div>
							{/if}
						{/each}
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- ═══════════════════════════════════════════════════════════════════════
	     SETUP
	     ═══════════════════════════════════════════════════════════════════════ -->
	<section class="mb-12" id="setup">
		<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">
			Setup & API key
		</h2>
		<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			All AI features require an API key from <strong>OpenRouter</strong> — a single key that gives access
			to models from Anthropic, Google, OpenAI, Meta and others.
		</p>
		<div class="space-y-3">
			<div
				class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<p class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">1. Get a key</p>
				<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					Create an account at <strong>openrouter.ai</strong> and generate an API key. You pay per token
					used — there is no monthly subscription from OpenRouter.
				</p>
			</div>
			<div
				class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<p class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">
					2. Add it in Settings
				</p>
				<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					Go to <strong>Settings → AI Assistant</strong>, paste the key, and save. You can set a
					different model per task type (chat, draft, review, grammar…).
				</p>
			</div>
			<div
				class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
			>
				<p class="font-sans text-sm font-semibold text-ink dark:text-dark-ink">Organisations</p>
				<p class="mt-0.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
					Org admins can add an org-level key so all members share it without configuring their own.
					Personal keys take priority if both are set.
				</p>
			</div>
		</div>
		<Callout
			>Your documents are never sent to AI providers without an active API key. The key is stored
			encrypted and is never exposed to other users.</Callout
		>
	</section>

	<!-- ═══════════════════════════════════════════════════════════════════════
	     AGENT TOOLS
	     ═══════════════════════════════════════════════════════════════════════ -->
	<section class="mb-6" id="agent-tools">
		<h2 class="font-serif text-xl font-semibold text-ink dark:text-dark-ink">Agent tools</h2>
		<p class="mt-1 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			The conversational agent (AI tab) has nine tools split into two groups: read tools that run
			silently in the background, and write tools that always ask for your confirmation before
			making changes.
		</p>
	</section>

	<!-- Read tools -->
	<section class="mb-10" id="read-tools">
		<h3 class="mb-1 font-serif text-base font-semibold text-ink dark:text-dark-ink">Read tools</h3>
		<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			These run automatically during the agent loop. You never need to trigger them explicitly — the
			model decides when to call them based on your question.
		</p>
		<div class="space-y-3">
			{#each [{ name: 'get_project_context', badge: 'called first', badgeColor: 'bg-accent/10 text-accent', desc: 'Returns a snapshot of the project: title, description, list of all documents with their summaries, open requirements, bibliography entries, and open issues. The agent calls this automatically at the start of any project-related question.', returns: 'Project metadata + document list + bibliography + requirements + issues' }, { name: 'read_document', badge: 'full content', badgeColor: 'bg-paper-border text-ink-muted dark:bg-dark-paper-border dark:text-dark-ink-muted', desc: 'Fetches the complete Markdown content of a specific document by ID. Used when the agent needs to analyse, quote, or review the full text of a document identified via get_project_context.', returns: 'Full Markdown content of the document' }, { name: 'search_documents_semantic', badge: 'vector search', badgeColor: 'bg-paper-border text-ink-muted dark:bg-dark-paper-border dark:text-dark-ink-muted', desc: 'Runs a semantic similarity search over all document chunks using pgvector embeddings. Returns the 6 most relevant passages even if they don\'t share keywords with the query. Useful for "find everything related to X" questions.', returns: 'Top 6 text chunks with document title and relevance score' }, { name: 'list_references', badge: null, badgeColor: '', desc: 'Returns the full bibliography of the project: citekeys, authors, year, title, journal/publisher. The agent uses this to answer questions about sources and to suggest citations when drafting.', returns: 'All bibliography entries with metadata' }, { name: 'get_requirement_details', badge: null, badgeColor: '', desc: 'Returns the project\'s requirements (if configured) with their completion status: fulfilled ✓, pending mandatory ✗, or pending optional ○. Useful for asking "what sections am I still missing?"', returns: 'Requirements list with status per requirement' }, { name: 'list_issues', badge: null, badgeColor: '', desc: 'Returns all open issues in the project with their title, priority and a preview of the content. Allows the agent to give advice on what the review panel has flagged.', returns: 'Open issues with priority and preview' }] as tool}
				<div
					class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
				>
					<div class="flex flex-wrap items-center gap-2">
						<code class="font-mono text-sm text-accent">{tool.name}</code>
						{#if tool.badge}
							<span class="rounded px-1.5 py-0.5 font-mono text-[10px] {tool.badgeColor}"
								>{tool.badge}</span
							>
						{/if}
					</div>
					<p class="mt-1.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
						{tool.desc}
					</p>
					<p class="mt-1.5 font-sans text-[11px] text-ink-faint dark:text-dark-ink-faint">
						<span class="font-semibold">Returns:</span>
						{tool.returns}
					</p>
				</div>
			{/each}
		</div>
	</section>

	<!-- Write tools -->
	<section class="mb-10" id="write-tools">
		<h3 class="mb-1 font-serif text-base font-semibold text-ink dark:text-dark-ink">
			Write tools <span
				class="font-sans text-xs font-normal text-ink-muted dark:text-dark-ink-muted"
				>(with confirmation)</span
			>
		</h3>
		<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			These tools never execute automatically. When the agent calls one, the response is paused and
			a confirmation card appears in the chat. You review the proposed change and either accept or
			discard it.
		</p>
		<div class="space-y-3">
			{#each [{ name: 'create_document', params: 'title, type (paper · notes · outline · bibliography · supplementary), content, requirementId?', desc: 'Proposes a new document with full Markdown content. Only called if you explicitly ask the agent to write or draft something. You see a preview of the document before it is created.', confirmation: 'Preview card with title, type and full content' }, { name: 'create_issue', params: 'title, content?, priority (low · medium · high · critical)', desc: "Proposes a new issue in the project's review panel. The agent must describe the problem in its reply text before calling this tool — you always see the reasoning first.", confirmation: 'Issue card with title, priority and content' }, { name: 'propose_references', params: 'Array of references: citeKey, type, title, authors, year, journal?, publisher?…', desc: 'Proposes one or more bibliography entries to add to the project. Shown as a checklist card — you select which references to actually add before anything is saved.', confirmation: 'Checklist card — select which references to add' }] as tool}
				<div
					class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/40 dark:bg-amber-950/20"
				>
					<div class="flex flex-wrap items-center gap-2">
						<code class="font-mono text-sm text-ink dark:text-dark-ink">{tool.name}</code>
						<span
							class="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
							>requires confirmation</span
						>
					</div>
					<p class="mt-1 font-sans text-[11px] text-ink-faint dark:text-dark-ink-faint">
						<span class="font-semibold">Params:</span>
						{tool.params}
					</p>
					<p class="mt-1.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
						{tool.desc}
					</p>
					<p class="mt-1.5 font-sans text-[11px] text-ink-faint dark:text-dark-ink-faint">
						<span class="font-semibold">Confirmation UI:</span>
						{tool.confirmation}
					</p>
				</div>
			{/each}
		</div>
		<Callout
			>The agent never modifies your project silently. Every write operation — document creation,
			issue creation, reference addition — requires an explicit click on your part.</Callout
		>
	</section>

	<!-- ═══════════════════════════════════════════════════════════════════════
	     EDITOR TOOLS
	     ═══════════════════════════════════════════════════════════════════════ -->
	<section class="mb-10" id="editor-tools">
		<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">Editor tools</h2>
		<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			Select text in any document and click the AI button in the toolbar to open the inline
			assistant. It has its own set of tools designed for precise in-document edits.
		</p>
		<div class="space-y-3">
			{#each [{ name: 'check_spelling', type: 'read', desc: 'Detects spelling errors in the selected text or full document. Returns a list of corrections with position and suggested replacement.' }, { name: 'check_grammar', type: 'read', desc: 'Reviews grammar and style. Particularly useful for non-native English writers. Returns annotated suggestions with explanations.' }, { name: 'find_untagged', type: 'read', desc: 'Scans the document for people mentioned by name without a [[person:Name]] tag and for sources cited without a [[@citeKey]] citation. Returns a list of candidates to tag.' }, { name: 'list_references', type: 'read', desc: 'Returns the project bibliography, so the assistant can suggest the right citekey when you ask it to add a citation.' }, { name: 'replace_text', type: 'write', desc: 'Replaces an exact substring in the document with new content. Before applying, you see a before/after diff. The anchor text must match verbatim.' }, { name: 'insert_after', type: 'write', desc: 'Inserts new content immediately after a specific passage. Useful for expanding a paragraph or adding a footnote after a sentence.' }, { name: 'propose_references', type: 'write', desc: 'Same as the agent version — proposes bibliography entries to add to the project, with a checklist confirmation card.' }] as tool}
				<div
					class="rounded-xl border border-paper-border bg-paper-ui px-4 py-3 dark:border-dark-paper-border dark:bg-dark-paper-ui"
				>
					<div class="flex flex-wrap items-center gap-2">
						<code class="font-mono text-sm text-accent">{tool.name}</code>
						{#if tool.type === 'write'}
							<span
								class="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
								>confirmation</span
							>
						{:else}
							<span
								class="rounded bg-paper-border px-1.5 py-0.5 font-mono text-[10px] text-ink-muted dark:bg-dark-paper-border dark:text-dark-ink-muted"
								>read</span
							>
						{/if}
					</div>
					<p class="mt-1.5 font-sans text-xs text-ink-muted dark:text-dark-ink-muted">
						{tool.desc}
					</p>
				</div>
			{/each}
		</div>
	</section>

	<!-- ═══════════════════════════════════════════════════════════════════════
	     TASK-BASED FEATURES
	     ═══════════════════════════════════════════════════════════════════════ -->
	<section class="mb-10" id="task-tools">
		<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">
			Task-based features
		</h2>
		<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			These are single-round operations triggered by explicit UI actions. They don't use the agent
			loop — they send a fixed context to a purpose-specific model and return a structured result.
		</p>
		<div
			class="overflow-hidden rounded-xl border border-paper-border dark:border-dark-paper-border"
		>
			<table class="w-full font-sans text-sm">
				<thead>
					<tr
						class="border-b border-paper-border bg-paper-ui dark:border-dark-paper-border dark:bg-dark-paper-ui"
					>
						<th class="px-4 py-2.5 text-left font-medium text-ink-muted dark:text-dark-ink-muted"
							>Task</th
						>
						<th class="px-4 py-2.5 text-left font-medium text-ink-muted dark:text-dark-ink-muted"
							>Where</th
						>
						<th class="px-4 py-2.5 text-left font-medium text-ink-muted dark:text-dark-ink-muted"
							>What it does</th
						>
					</tr>
				</thead>
				<tbody class="divide-y divide-paper-border dark:divide-dark-paper-border">
					{#each [{ task: 'Draft', where: 'AI tab', desc: 'Generates a full document or section from a description and optional selected context documents.' }, { task: 'Review', where: 'Document toolbar', desc: 'Analyses the document against project requirements. Returns which requirements are met, which are missing, and which bibliography entries are uncited.' }, { task: 'Requirements', where: 'Requirements tab', desc: 'Generates structured requirements for a project type (thesis, paper, report…) from a brief description.' }, { task: 'Bibliography', where: 'Bib tab', desc: 'Extracts full bibliographic metadata from a URL or webpage using AI. Faster than filling the form manually.' }, { task: 'Spell check', where: 'Document toolbar', desc: 'On-demand spelling correction for the full document. Shows a list of errors with one-click fixes.' }, { task: 'Grammar check', where: 'Document toolbar', desc: 'Reviews grammar and style for the full document. Returns annotated suggestions with explanations.' }, { task: 'Summary', where: 'Automatic on commit', desc: 'Generates a short summary of the document content. Stored with the commit and used as context in the agent.' }] as row}
						<tr>
							<td class="px-4 py-3">
								<code class="font-mono text-xs text-ink dark:text-dark-ink">{row.task}</code>
							</td>
							<td
								class="px-4 py-3 font-sans text-xs whitespace-nowrap text-ink-muted dark:text-dark-ink-muted"
								>{row.where}</td
							>
							<td class="px-4 py-3 font-sans text-xs text-ink-muted dark:text-dark-ink-muted"
								>{row.desc}</td
							>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<!-- ═══════════════════════════════════════════════════════════════════════
	     MODELS
	     ═══════════════════════════════════════════════════════════════════════ -->
	<section class="mb-10" id="models">
		<h2 class="mb-1 font-serif text-lg font-semibold text-ink dark:text-dark-ink">
			Supported models
		</h2>
		<p class="mb-4 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			All models are accessed through OpenRouter with a single key. You can assign a different model
			to each task in <strong>Settings → AI Assistant</strong>.
		</p>
		<div
			class="overflow-hidden rounded-xl border border-paper-border dark:border-dark-paper-border"
		>
			<table class="w-full font-sans text-sm">
				<thead>
					<tr
						class="border-b border-paper-border bg-paper-ui dark:border-dark-paper-border dark:bg-dark-paper-ui"
					>
						<th class="px-4 py-2.5 text-left font-medium text-ink-muted dark:text-dark-ink-muted"
							>Provider</th
						>
						<th class="px-4 py-2.5 text-left font-medium text-ink-muted dark:text-dark-ink-muted"
							>Model</th
						>
						<th class="px-4 py-2.5 text-left font-medium text-ink-muted dark:text-dark-ink-muted"
							>Tool calling</th
						>
						<th class="px-4 py-2.5 text-left font-medium text-ink-muted dark:text-dark-ink-muted"
							>Best for</th
						>
					</tr>
				</thead>
				<tbody class="divide-y divide-paper-border dark:divide-dark-paper-border">
					{#each [{ provider: 'Anthropic', model: 'Claude Opus 4.5', tools: true, note: 'Complex reasoning, long context' }, { provider: 'Anthropic', model: 'Claude Sonnet 4.6', tools: true, note: 'Default for agent & draft' }, { provider: 'Anthropic', model: 'Claude Haiku 4.5', tools: true, note: 'Default for spell, grammar, summary' }, { provider: 'Google', model: 'Gemini 2.5 Pro', tools: true, note: 'Long documents' }, { provider: 'Google', model: 'Gemini 2.5 Flash', tools: true, note: 'Default for requirements' }, { provider: 'OpenAI', model: 'GPT-4o', tools: true, note: 'General purpose' }, { provider: 'OpenAI', model: 'GPT-4o mini', tools: true, note: 'Fast and cheap' }, { provider: 'DeepSeek', model: 'DeepSeek R1', tools: false, note: 'Default for review — strong at critique' }, { provider: 'DeepSeek', model: 'DeepSeek V3', tools: true, note: 'General purpose' }, { provider: 'Meta', model: 'Llama 3.3 70B', tools: true, note: 'Open-weight alternative' }, { provider: 'Perplexity', model: 'Sonar', tools: false, note: 'Web-augmented answers' }, { provider: 'Perplexity', model: 'Sonar Pro', tools: false, note: 'Web-augmented, higher quality' }] as row}
						<tr>
							<td class="px-4 py-3 font-sans text-xs text-ink-muted dark:text-dark-ink-muted"
								>{row.provider}</td
							>
							<td class="px-4 py-3">
								<code class="font-mono text-xs text-ink dark:text-dark-ink">{row.model}</code>
							</td>
							<td class="px-4 py-3">
								{#if row.tools}
									<span class="font-mono text-xs text-green-600 dark:text-green-400">✓ yes</span>
								{:else}
									<span class="font-mono text-xs text-ink-faint dark:text-dark-ink-faint">— no</span
									>
								{/if}
							</td>
							<td class="px-4 py-3 font-sans text-xs text-ink-muted dark:text-dark-ink-muted"
								>{row.note}</td
							>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<Callout
			>Models without tool calling (DeepSeek R1, Perplexity) cannot be used as the conversational
			agent. They work fine for task-based features like review, spell and grammar.</Callout
		>
	</section>

	<!-- ═══════════════════════════════════════════════════════════════════════
	     TIPS
	     ═══════════════════════════════════════════════════════════════════════ -->
	<section id="tips">
		<h2 class="mb-4 font-serif text-lg font-semibold text-ink dark:text-dark-ink">Tips</h2>
		<ul class="space-y-2 font-sans text-sm text-ink-muted dark:text-dark-ink-muted">
			<li class="flex gap-2">
				<span class="text-ink-faint dark:text-dark-ink-faint">—</span>
				The agent works best when there is content to read. Add and commit documents before asking complex
				analysis questions.
			</li>
			<li class="flex gap-2">
				<span class="text-ink-faint dark:text-dark-ink-faint">—</span>
				Commit documents regularly — summaries are generated on commit and are what the agent sees first
				in
				<code class="rounded bg-paper-ui px-1 font-mono text-xs dark:bg-dark-paper-ui"
					>get_project_context</code
				>.
			</li>
			<li class="flex gap-2">
				<span class="text-ink-faint dark:text-dark-ink-faint">—</span>
				Use <strong>semantic search</strong> by asking "find everything I wrote about X" — the agent
				will call
				<code class="rounded bg-paper-ui px-1 font-mono text-xs dark:bg-dark-paper-ui"
					>search_documents_semantic</code
				> automatically.
			</li>
			<li class="flex gap-2">
				<span class="text-ink-faint dark:text-dark-ink-faint">—</span>
				For large rewrites, use <strong>Draft</strong> from the AI tab rather than the inline editor —
				it has more context and no character limit.
			</li>
			<li class="flex gap-2">
				<span class="text-ink-faint dark:text-dark-ink-faint">—</span>
				<strong>Review</strong> is most useful after adding requirements to the project. Without requirements,
				it gives general feedback.
			</li>
			<li class="flex gap-2">
				<span class="text-ink-faint dark:text-dark-ink-faint">—</span>
				Assign <strong>DeepSeek R1</strong> to the review task for the most critical and detailed feedback
				— it is specifically strong at identifying gaps in argumentation.
			</li>
			<li class="flex gap-2">
				<span class="text-ink-faint dark:text-dark-ink-faint">—</span>
				Use <strong>find_untagged</strong> before exporting — it catches people and sources mentioned
				in the text that were never formally cited or tagged.
			</li>
		</ul>
	</section>
</div>
