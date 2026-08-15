<script lang="ts">
	// Lightweight plain-text CodeMirror editor for Mermaid source. Deliberately
	// does not share MarkdownEditor's extension bundle (markdown lang mode,
	// citations, comments, mentions) — none of that applies to diagram code.
	import { onMount, onDestroy } from 'svelte';
	import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
	import { EditorState } from '@codemirror/state';
	import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
	import { oneDark } from '@codemirror/theme-one-dark';

	let {
		value = $bindable(''),
		readonly = false,
		ondocchange
	}: {
		value?: string;
		readonly?: boolean;
		ondocchange?: (content: string) => void;
	} = $props();

	let container: HTMLDivElement | null = null;
	let view: EditorView | null = null;

	function isDarkMode() {
		return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
	}

	function buildExtensions() {
		const exts = [
			lineNumbers(),
			highlightActiveLine(),
			history(),
			keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
			EditorView.lineWrapping,
			EditorView.editable.of(!readonly),
			EditorView.updateListener.of((update) => {
				if (update.docChanged) {
					const doc = update.state.doc.toString();
					value = doc;
					ondocchange?.(doc);
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

	onDestroy(() => view?.destroy());

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

	// Sync external value changes (e.g. an AI-proposed edit being applied, or
	// restoreVersion) without re-triggering ondocchange.
	$effect(() => {
		if (!view) return;
		const current = view.state.doc.toString();
		if (current !== value) {
			view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
		}
	});
</script>

<div bind:this={container} class="codemirror-host h-full w-full"></div>

<style>
	.codemirror-host :global(.cm-editor) {
		height: 100%;
		outline: none;
	}
	.codemirror-host :global(.cm-scroller) {
		font-family: ui-monospace, 'SF Mono', Menlo, monospace;
		font-size: 0.875rem;
	}
</style>
