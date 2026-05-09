<script lang="ts">
	let { onclose }: { onclose: () => void } = $props();
</script>

<div
	class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
	role="presentation"
	onclick={onclose}
></div>

<div
	class="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col overflow-hidden bg-paper shadow-2xl dark:bg-dark-paper"
	role="dialog"
	aria-modal="true"
	aria-label="Syntax reference"
>
	<div
		class="flex shrink-0 items-center justify-between border-b border-paper-border px-6 py-4 dark:border-dark-paper-border"
	>
		<p class="font-serif text-lg font-semibold text-ink dark:text-dark-ink">Syntax reference</p>
		<button
			onclick={onclose}
			class="rounded p-1 text-ink-faint hover:text-ink dark:text-dark-ink-faint dark:hover:text-dark-ink"
			aria-label="Close"
		>
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path
					d="M18 6L6 18M6 6l12 12"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
				/>
			</svg>
		</button>
	</div>

	<div class="flex-1 space-y-6 overflow-y-auto px-6 py-5 font-sans text-sm">
		<p class="text-xs text-ink-muted dark:text-dark-ink-muted">
			Documents are formatted with
			<a
				href="https://www.markdownguide.org/basic-syntax/"
				target="_blank"
				rel="noopener noreferrer"
				class="text-accent underline underline-offset-2 hover:text-accent-hover">Markdown</a
			>. Use the left pane to write and the right pane to preview. Save with
			<kbd
				class="rounded border border-paper-border bg-paper-ui px-1 py-0.5 font-mono text-[10px] text-ink dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
				>Ctrl+S</kbd
			>.
		</p>

		<div>
			<p class="mb-2 font-medium text-ink dark:text-dark-ink">Formatting</p>
			<table class="w-full">
				<tbody class="divide-y divide-paper-border dark:divide-dark-paper-border">
					{#each [['# Title', 'Heading 1 — creates document structure'], ['## Section', 'Heading 2'], ['**bold**', 'Bold'], ['*italic*', 'Italic'], ['`code`', 'Inline code'], ['> quote', 'Blockquote'], ['- item', 'Unordered list'], ['1. item', 'Numbered list'], ['[text](url)', 'Hyperlink'], ['---', 'Horizontal rule (visible separator)']] as item, i (i)}
						<tr>
							<td class="py-1.5 pr-4 font-mono text-xs text-accent">{item[0]}</td>
							<td class="py-1.5 text-ink-muted dark:text-dark-ink-muted">{item[1]}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div>
			<p class="mb-2 font-medium text-ink dark:text-dark-ink">Footnotes</p>
			<table class="w-full">
				<tbody class="divide-y divide-paper-border dark:divide-dark-paper-border">
					<tr>
						<td class="py-1.5 pr-4 font-mono text-xs text-accent">text[^1]</td>
						<td class="py-1.5 text-ink-muted dark:text-dark-ink-muted">Footnote marker in text</td>
					</tr>
					<tr>
						<td class="py-1.5 pr-4 font-mono text-xs text-accent">[^1]: Note text</td>
						<td class="py-1.5 text-ink-muted dark:text-dark-ink-muted"
							>Footnote definition (at end of document)</td
						>
					</tr>
				</tbody>
			</table>
		</div>

		<div>
			<p class="mb-2 font-medium text-ink dark:text-dark-ink">Bibliographic citations</p>
			<table class="w-full">
				<tbody class="divide-y divide-paper-border dark:divide-dark-paper-border">
					<tr>
						<td class="py-1.5 pr-4 font-mono text-xs text-accent">[[@citeKey]]</td>
						<td class="py-1.5 text-ink-muted dark:text-dark-ink-muted">Single citation</td>
					</tr>
					<tr>
						<td class="py-1.5 pr-4 font-mono text-xs text-accent">[[@key1; @key2]]</td>
						<td class="py-1.5 text-ink-muted dark:text-dark-ink-muted">Multiple citations</td>
					</tr>
				</tbody>
			</table>
			<p class="mt-1.5 text-xs text-ink-faint dark:text-dark-ink-faint">
				Type <span class="font-mono">[[@</span> to autocomplete from your bibliography.
			</p>
		</div>

		<div>
			<p class="mb-2 font-medium text-ink dark:text-dark-ink">Wikilinks</p>
			<p class="mb-2 text-xs text-ink-muted dark:text-dark-ink-muted">
				Link to other documents in your project — they will be highlighted and clickable in the
				preview.
			</p>
			<table class="w-full">
				<tbody class="divide-y divide-paper-border dark:divide-dark-paper-border">
					<tr>
						<td class="py-1.5 pr-4 font-mono text-xs text-accent">[[Title]]</td>
						<td class="py-1.5 text-ink-muted dark:text-dark-ink-muted">Same project</td>
					</tr>
					<tr>
						<td class="py-1.5 pr-4 font-mono text-xs text-accent">[[Title:hash]]</td>
						<td class="py-1.5 text-ink-muted dark:text-dark-ink-muted">External document</td>
					</tr>
				</tbody>
			</table>
		</div>

		<div>
			<p class="mb-2 font-medium text-ink dark:text-dark-ink">Keyboard shortcuts</p>
			<table class="w-full">
				<tbody class="divide-y divide-paper-border dark:divide-dark-paper-border">
					{#each [['Ctrl+S', 'Save draft'], ['Ctrl+/', 'Syntax reference'], ['Ctrl+F', 'Find in document'], ['Ctrl+Shift+F', 'Semantic search'], ['Esc', 'Close panels']] as item, i (i)}
						<tr>
							<td class="py-1.5 pr-4">
								<kbd
									class="rounded border border-paper-border bg-paper-ui px-1.5 py-0.5 font-mono text-xs text-ink dark:border-dark-paper-border dark:bg-dark-paper-ui dark:text-dark-ink"
									>{item[0]}</kbd
								>
							</td>
							<td class="py-1.5 text-ink-muted dark:text-dark-ink-muted">{item[1]}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</div>
