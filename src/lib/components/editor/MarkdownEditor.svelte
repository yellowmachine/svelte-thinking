<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
	import { EditorState } from '@codemirror/state';
	import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
	import { markdown } from '@codemirror/lang-markdown';
	import { oneDark } from '@codemirror/theme-one-dark';
	import {
		commentRangesField,
		commentTheme,
		setCommentRanges,
		type CommentRange
	} from './commentsExtension';
	import { codeBlockExtension, codeLanguages } from './codeBlockExtension';

	let {
		value = $bindable(''),
		readonly = false,
		ondocchange,
		onselectionchange,
		commentRanges = [],
		scrollToRange = null
	}: {
		value?: string;
		readonly?: boolean;
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

	function buildExtensions() {
		const exts = [
			history(),
			lineNumbers(),
			highlightActiveLine(),
			keymap.of([...defaultKeymap, ...historyKeymap]),
			markdown({ codeLanguages }),
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
