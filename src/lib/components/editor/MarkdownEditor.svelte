<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
	import { EditorState } from '@codemirror/state';
	import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
	import { markdown } from '@codemirror/lang-markdown';
	import { oneDark } from '@codemirror/theme-one-dark';
	import { autocompletion, type CompletionContext, type Completion } from '@codemirror/autocomplete';
	import {
		commentRangesField,
		commentTheme,
		setCommentRanges,
		type CommentRange
	} from './commentsExtension';
	import { codeBlockExtension, codeLanguages } from './codeBlockExtension';
	import { epigraphCompletion } from './epigraphExtension';
	import type { CiteRef } from '$lib/utils/citations';

	let {
		value = $bindable(''),
		readonly = false,
		references = [],
		chapters = [],
		ondocchange,
		onselectionchange,
		commentRanges = [],
		scrollToRange = null
	}: {
		value?: string;
		readonly?: boolean;
		references?: CiteRef[];
		chapters?: { id: string; title: string }[];
		ondocchange?: (content: string) => void;
		onselectionchange?: (sel: {
			text: string;
			from: number;
			to: number;
			coords: { top: number; bottom: number; left: number; right: number } | null;
		} | null) => void;
		commentRanges?: CommentRange[];
		scrollToRange?: { from: number; to: number } | null;
	} = $props();

	let container: HTMLDivElement | null = null;
	let view: EditorView | null = null;

	function isDarkMode() {
		return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
	}

	// [[ dispatcher — character after [[ determines completion type:
	//   [[        → wikilinks / chapters
	//   [[@       → bibliographic citations  (inserts [[@key]])
	//   [[#       → heading anchor in current document
	//   [[^       → footnote (inserts [^N] inline + [^N]: at end)
	//   [[! [[~   → reserved (embeds, snippets)

	function wikilinkCompletion(context: CompletionContext) {
		// Matches [[ NOT immediately followed by a special dispatcher char (@, #, !, ^, ~)
		const match = context.matchBefore(/\[\[(?![@#!^~])[^\]]*$/);
		if (!match) return null;

		const typed = match.text.slice(2).toLowerCase(); // strip [[
		const options: Completion[] = chapters
			.filter((c) => !typed || c.title.toLowerCase().includes(typed))
			.map((c) => ({
				label: c.title,
				detail: 'chapter',
				apply: `[[doc:${c.id}|${c.title}]]`
			}));

		if (options.length === 0) return null;
		return { from: match.from, options };
	}

	function citationCompletion(context: CompletionContext) {
		// Matches [[@key…  — user typed [[ then @
		const match = context.matchBefore(/\[\[@[\w.-]*/);
		if (!match) return null;

		const typed = match.text.slice(3); // strip [[@
		const options: Completion[] = references
			.filter((r) => !typed || r.citeKey.toLowerCase().includes(typed.toLowerCase()))
			.map((r) => {
				const author = r.authors[0] ? `${r.authors[0].last}` : '';
				const year = r.year ?? '';
				return {
					label: r.citeKey,
					detail: [author, year].filter(Boolean).join(', '),
					info: r.title,
					apply: `@${r.citeKey}]]` // keeps leading [[ from match.from+2
				};
			});

		if (options.length === 0) return null;
		return { from: match.from + 2, options }; // +2: skip [[, replace @key…
	}

	function headingCompletion(context: CompletionContext) {
		const match = context.matchBefore(/\[\[#[^\]]*$/);
		if (!match) return null;

		const typed = match.text.slice(3).toLowerCase(); // strip [[#
		const options: Completion[] = [];
		for (const line of value.split('\n')) {
			const m = line.match(/^(#{1,6})\s+(.+)$/);
			if (!m) continue;
			const text = m[2].trim();
			if (!typed || text.toLowerCase().includes(typed)) {
				options.push({
					label: text,
					detail: m[1], // heading level (##, ###…)
					apply: `[[#${text}]]`
				});
			}
		}

		if (options.length === 0) return null;
		return { from: match.from, options };
	}

	function footnoteCompletion(context: CompletionContext) {
		const match = context.matchBefore(/\[\[\^[^\]]*$/);
		if (!match) return null;

		const n = (value.match(/\[\^\d+\]:/g) ?? []).length + 1;
		const options: Completion[] = [
			{
				label: `footnote ${n}`,
				detail: `[^${n}]`,
				apply: (view, _c, from, to) => {
					const ref = `[^${n}]`;
					const def = `\n\n[^${n}]: `;
					const docEnd = view.state.doc.length;
					view.dispatch({
						changes: [
							{ from, to, insert: ref },
							{ from: docEnd, insert: def }
						],
						selection: { anchor: docEnd + ref.length - (to - from) + def.length }
					});
				}
			}
		];

		return { from: match.from, options };
	}

	function allCompletions(context: CompletionContext) {
		return (
			epigraphCompletion(context) ??
			citationCompletion(context) ??
			headingCompletion(context) ??
			footnoteCompletion(context) ??
			wikilinkCompletion(context)
		);
	}

	function buildExtensions() {
		const exts = [
			history(),
			lineNumbers(),
			highlightActiveLine(),
			keymap.of([...defaultKeymap, ...historyKeymap]),
			markdown({ codeLanguages }),
			autocompletion({ override: [allCompletions], closeOnBlur: true }),
			...codeBlockExtension(),
			EditorView.lineWrapping,
			commentRangesField,
			commentTheme,
			EditorView.updateListener.of((update) => {
				if (update.docChanged) {
					const content = update.state.doc.toString();
					value = content;
					ondocchange?.(content);
				}
				if (update.selectionSet && onselectionchange) {
					const sel = update.state.selection.main;
					if (sel.empty) {
						onselectionchange(null);
					} else {
						const text = update.state.doc.sliceString(sel.from, sel.to);
						const coords = update.view.coordsAtPos(sel.from);
						onselectionchange({ text, from: sel.from, to: sel.to, coords });
					}
				}
			}),
			EditorView.editable.of(!readonly),
			EditorView.theme({
				'&': {
					fontSize: '18px',
					fontFamily: '"Source Serif 4", Georgia, serif',
					lineHeight: '1.75',
					backgroundColor: 'transparent'
				},
				'.cm-content': {
					padding: '0',
					caretColor: 'var(--color-accent, #7C5C3E)'
				},
				'.cm-line': { padding: '0' },
				'.cm-focused .cm-cursor': {
					borderLeftColor: 'var(--color-accent, #7C5C3E)'
				},
				'.cm-gutters': {
					backgroundColor: 'transparent',
					border: 'none',
					color: 'var(--color-ink-faint, #A89880)'
				},
				'.cm-activeLineGutter': { backgroundColor: 'transparent' },
				'.cm-activeLine': { backgroundColor: 'transparent' },
				'.cm-selectionBackground, ::selection': {
					backgroundColor: 'rgba(124, 92, 62, 0.15) !important'
				}
			})
		];

		if (isDarkMode()) exts.push(oneDark);
		return exts;
	}

	function createView(el: HTMLDivElement, doc: string) {
		view = new EditorView({
			state: EditorState.create({ doc, extensions: buildExtensions() }),
			parent: el
		});
	}

	function rebuildView() {
		if (!view || !container) return;
		const doc = view.state.doc.toString();
		view.destroy();
		createView(container, doc);
	}

	onMount(() => {
		if (!container) return;
		createView(container, value);

		const observer = new MutationObserver(rebuildView);
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
		return () => observer.disconnect();
	});

	onDestroy(() => {
		view?.destroy();
	});

	// Insert text at the current cursor position.
	// Called from the parent via bind:this.
	export function insertAtCursor(text: string) {
		if (!view) return;
		const { from, to } = view.state.selection.main;
		view.dispatch({
			changes: { from, to, insert: text },
			selection: { anchor: from + text.length }
		});
		view.focus();
	}

	export function getSelection(): { text: string; from: number; to: number } | null {
		if (!view) return null;
		const { from, to } = view.state.selection.main;
		if (from === to) return null;
		return { text: view.state.doc.sliceString(from, to), from, to };
	}

	export function replaceRange(from: number, to: number, text: string) {
		if (!view) return;
		view.dispatch({
			changes: { from, to, insert: text },
			selection: { anchor: from + text.length }
		});
		view.focus();
	}

	// Sync external value changes (e.g. restoreVersion) without triggering ondocchange
	$effect(() => {
		if (!view) return;
		const current = view.state.doc.toString();
		if (current !== value) {
			view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
		}
	});

	// Sync comment highlight decorations
	$effect(() => {
		if (!view) return;
		view.dispatch({ effects: setCommentRanges.of(commentRanges) });
	});

	// Scroll editor to a given range (e.g. clicking a comment in the sidebar)
	$effect(() => {
		if (!view || !scrollToRange) return;
		view.dispatch({
			selection: { anchor: scrollToRange.from },
			effects: EditorView.scrollIntoView(scrollToRange.from, { y: 'center' })
		});
	});
</script>

<div bind:this={container} class="codemirror-host w-full"></div>

<style>
	.codemirror-host :global(.cm-editor) {
		outline: none;
		width: 100%;
	}
	.codemirror-host :global(.cm-editor.cm-focused) {
		outline: none;
	}
	.codemirror-host :global(.cm-scroller) {
		font-family: 'Source Serif 4', Georgia, serif;
		overflow: visible;
	}
</style>
