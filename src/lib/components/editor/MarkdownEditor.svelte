<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { EditorView, keymap, lineNumbers, highlightActiveLine, tooltips, Decoration, WidgetType } from '@codemirror/view';
	import { EditorState, StateEffect, StateField } from '@codemirror/state';
	import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
	import { markdown } from '@codemirror/lang-markdown';
	import { oneDark } from '@codemirror/theme-one-dark';
	import { autocompletion, acceptCompletion, type CompletionContext, type Completion } from '@codemirror/autocomplete';
	import {
		commentRangesField,
		commentTheme,
		setCommentRanges,
		type CommentRange
	} from './commentsExtension';
	import { codeBlockExtension, codeLanguages } from './codeBlockExtension';
	import { epigraphCompletion } from './epigraphExtension';
	import type { CiteRef } from '$lib/utils/citations';
	import { linter, type Diagnostic } from '@codemirror/lint';

	let {
		value = $bindable(''),
		readonly = false,
		references = [],
		chapters = [],
		ondocchange,
		onselectionchange,
		onlookup,
		onwordprefix,
		onwordprefixclear,
		onwordghosttab,
		oncitehover,
		onauthorhover,
		onheadinghover,
		commentRanges = [],
		scrollToRange = null,
		completions = undefined,
		showLookupHint = false,
	spellLanguage = 'en-US',
	onignoreword
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
		onlookup?: (partial: string, context: string) => Promise<string[]>;
		/** Called when cursor is inside a capitalised mid-sentence word ≥3 chars. */
		onwordprefix?: (prefix: string, from: number, cursorPos: number) => void;
		onwordprefixclear?: () => void;
		/** Called when Tab/ArrowRight is pressed while word-ghost is active. */
		onwordghosttab?: () => boolean;
		/** Called when cursor dwells on a [[@citeKey]] token (debounced 700ms). */
		oncitehover?: (citeKey: string, coords: { bottom: number; left: number }) => void;
		/** Called when cursor dwells on a [[person:Name]] token (debounced 700ms). */
		onauthorhover?: (name: string, coords: { bottom: number; left: number }) => void;
		/** Called when cursor dwells on a heading line (debounced 700ms). */
		onheadinghover?: (info: { level: number; title: string; wordCount: number }, coords: { bottom: number; left: number }) => void;
		commentRanges?: CommentRange[];
		scrollToRange?: { from: number; to: number } | null;
		/** Which [[ completions to enable. undefined = all active. */
		completions?: Set<'wikilink' | 'citation' | 'heading' | 'footnote' | 'mention' | 'epigraph'>;
		/** Show a footer hint that @@ lookup is unavailable (no AI key configured). */
		showLookupHint?: boolean;
		/** BCP-47 language tag for LanguageTool spell check (e.g. 'es-ES', 'en-US'). */
		spellLanguage?: string;
		/** Called when user clicks "Ignore always" on a spell diagnostic. */
		onignoreword?: (word: string) => void;
	} = $props();

	let container: HTMLDivElement | null = null;
	let view: EditorView | null = null;
	let wordGhostActive = false; // tracks whether word-level ghost text is active

	const SPELL_WINDOW = 3000; // chars around cursor to send to LanguageTool

	const spellLinter = linter(async (view): Promise<Diagnostic[]> => {
		const full = view.state.doc.toString();
		if (full.trim().length < 10) return [];

		// Extract window around cursor, snapping to word boundaries
		const cursor = view.state.selection.main.head;
		const rawFrom = Math.max(0, cursor - SPELL_WINDOW);
		const rawTo = Math.min(full.length, cursor + SPELL_WINDOW);
		// Snap to nearest whitespace to avoid cutting mid-word
		const sliceFrom = rawFrom === 0 ? 0 : (full.indexOf(' ', rawFrom) + 1 || rawFrom);
		const sliceTo = rawTo === full.length ? full.length : (full.lastIndexOf(' ', rawTo) || rawTo);
		const text = full.slice(sliceFrom, sliceTo);

		try {
			const res = await fetch('/api/spell', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text, language: spellLanguage })
			});
			if (!res.ok) return [];
			const data = await res.json() as {
				matches: { from: number; to: number; message: string; severity: string; replacements: string[] }[]
			};
			// Translate slice-relative offsets back to document positions
			return data.matches.map((m) => {
				const from = m.from + sliceFrom;
				const to = m.to + sliceFrom;
				const replaceActions = m.replacements.map((r) => ({
					name: r,
					apply(view: EditorView, from: number, to: number) {
						view.dispatch({ changes: { from, to, insert: r } });
					}
				}));
				const ignoreAction = onignoreword ? [{
					name: 'Ignore always',
					apply(view: EditorView, from: number, to: number) {
						const word = view.state.doc.sliceString(from, to);
						onignoreword!(word);
					}
				}] : [];
				return { from, to, severity: m.severity as 'error' | 'warning' | 'info', message: m.message, actions: [...replaceActions, ...ignoreAction] };
			});
		} catch {
			return [];
		}
	}, { delay: 1500 });

	// Debounce timer for citation hover
	let citeHoverTimer: ReturnType<typeof setTimeout> | null = null;

	const CITE_TOKEN_RE = /\[\[@([\w:._-]+)\]\]/g;
	const PERSON_TOKEN_RE = /\[\[person:([^\]]+)\]\]/g;

	function citationAtPos(doc: string, pos: number): { citeKey: string; from: number; to: number } | null {
		CITE_TOKEN_RE.lastIndex = 0;
		let m: RegExpExecArray | null;
		while ((m = CITE_TOKEN_RE.exec(doc)) !== null) {
			if (m.index <= pos && pos <= m.index + m[0].length) {
				return { citeKey: m[1], from: m.index, to: m.index + m[0].length };
			}
		}
		return null;
	}

	function personAtPos(doc: string, pos: number): { name: string; from: number; to: number } | null {
		PERSON_TOKEN_RE.lastIndex = 0;
		let m: RegExpExecArray | null;
		while ((m = PERSON_TOKEN_RE.exec(doc)) !== null) {
			if (m.index <= pos && pos <= m.index + m[0].length) {
				return { name: m[1].trim(), from: m.index, to: m.index + m[0].length };
			}
		}
		return null;
	}

	function headingAtPos(doc: string, pos: number): { level: number; title: string; wordCount: number } | null {
		const lineStart = doc.lastIndexOf('\n', pos - 1) + 1;
		const lineEnd = doc.indexOf('\n', pos);
		const line = doc.slice(lineStart, lineEnd === -1 ? doc.length : lineEnd);
		const m = line.match(/^(#{1,6})\s+(.+)$/);
		if (!m) return null;
		const level = m[1].length;
		const title = m[2].trim();
		// Count words from this heading to the next heading of same or higher level
		const rest = doc.slice(lineStart);
		const lines = rest.split('\n');
		let words = 0;
		for (let i = 1; i < lines.length; i++) {
			const hm = lines[i].match(/^(#{1,6})\s/);
			if (hm && hm[1].length <= level) break;
			words += lines[i].trim().split(/\s+/).filter(Boolean).length;
		}
		return { level, title, wordCount: words };
	}

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

	async function mentionCompletion(context: CompletionContext) {
		const match = context.matchBefore(/@@[\w\s.-]*/);
		if (!match || match.text.length < 3) return null;
		const partial = match.text.slice(2);
		if (!partial.trim()) return null;

		// Check document-local persons first (instant, no AI cost)
		const localRe = /\[\[person:([^\]]+)\]\]/g;
		const seen = new Set<string>();
		let m: RegExpExecArray | null;
		while ((m = localRe.exec(value)) !== null) seen.add(m[1]);
		const local = [...seen].filter(n => n.toLowerCase().includes(partial.toLowerCase()));

		if (local.length > 0) {
			return {
				from: match.from,
				options: local.map(name => ({ label: name, apply: `[[person:${name}]]`, type: 'variable' })),
				validFor: /^@@[\w\s.-]*$/
			};
		}

		// No local match → AI lookup
		if (!onlookup) return null;
		const docContext = value.slice(Math.max(0, context.pos - 300), context.pos);
		const names = await onlookup(partial, docContext);
		if (names.length === 0) return null;

		return {
			from: match.from,
			options: names.map(name => ({ label: name, apply: `[[person:${name}]]`, type: 'variable' })),
			validFor: /^@@[\w\s.-]*$/
		};
	}

	async function allCompletions(context: CompletionContext) {
		const all = completions === undefined;
		return (
			(all || completions.has('epigraph') ? epigraphCompletion(context) : null) ??
			(all || completions.has('citation') ? citationCompletion(context) : null) ??
			(all || completions.has('heading') ? headingCompletion(context) : null) ??
			(all || completions.has('footnote') ? footnoteCompletion(context) : null) ??
			(all || completions.has('mention') ? await mentionCompletion(context) : null) ??
			(all || completions.has('wikilink') ? wikilinkCompletion(context) : null)
		);
	}

	function buildExtensions() {
		const exts = [
			history(),
			lineNumbers(),
			highlightActiveLine(),
			keymap.of([
				{
					key: 'Tab',
					run(view) {
						if (wordGhostActive) return onwordghosttab?.() ?? false;
						return acceptCompletion(view);
					}
				},
				{
					key: 'ArrowRight',
					run(view) {
						if (wordGhostActive) return onwordghosttab?.() ?? false;
						return acceptCompletion(view);
					}
				},
				{
					key: 'Mod-Shift-i',
					run(view) {
						if (!onignoreword) return false;
						const pos = view.state.selection.main.head;
						const range = view.state.wordAt(pos);
						if (!range) return false;
						const word = view.state.doc.sliceString(range.from, range.to);
						if (word) onignoreword(word);
						return true;
					}
				},
				...defaultKeymap,
				...historyKeymap,
			]),
			markdown({ codeLanguages }),
			tooltips({ position: 'fixed' }),
			autocompletion({ override: [allCompletions], closeOnBlur: true }),
			...codeBlockExtension(),
			EditorView.lineWrapping,
			spellLinter,
			ghostTextField,
			EditorView.baseTheme({
				'.cm-ghost-text': { color: 'var(--color-ink-faint, #aaa)', pointerEvents: 'none' },
				'&.cm-editor .cm-tooltip-autocomplete': { border: '1px solid var(--color-paper-border, #e2e2e2)', borderRadius: '0.5rem', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', background: 'var(--color-paper, #fff)', fontFamily: 'var(--font-sans, sans-serif)', fontSize: '0.875rem' },
				'&.cm-editor .cm-tooltip-autocomplete ul li': { padding: '6px 12px', color: 'var(--color-ink, #111)' },
				'&.cm-editor .cm-tooltip-autocomplete ul li[aria-selected]': { background: 'var(--color-accent, #6366f1)', color: '#fff' },
			}),
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
						const coords = update.view.coordsAtPos(sel.to);
						onselectionchange({ text, from: sel.from, to: sel.to, coords });
					}
				}
				// Word-level ghost text — capitalised mid-sentence word ≥3 chars
				if ((update.docChanged || update.selectionSet) && (onwordprefix || onwordprefixclear)) {
					const sel = update.state.selection.main;
					if (sel.empty) {
						const doc = update.state.doc.toString();
						const pos = sel.head;
						// Walk back to find word start
						let wordFrom = pos;
						while (wordFrom > 0 && /\w/.test(doc[wordFrom - 1])) wordFrom--;
						const word = doc.slice(wordFrom, pos);
						// Must be ≥3 chars, start with uppercase
						if (word.length >= 3 && /^[A-Z]/.test(word)) {
							wordGhostActive = true;
							onwordprefix?.(word, wordFrom, pos);
						} else {
							wordGhostActive = false;
							onwordprefixclear?.();
						}
					} else {
						wordGhostActive = false;
						onwordprefixclear?.();
					}
				}
				// Token hover — cursor dwell on [[@key]], [[person:Name]], or ## heading
				if (update.selectionSet && (oncitehover || onauthorhover || onheadinghover)) {
					const sel = update.state.selection.main;
					if (citeHoverTimer) { clearTimeout(citeHoverTimer); citeHoverTimer = null; }
					if (sel.empty) {
						const doc = update.state.doc.toString();
						const pos = sel.from;
						const cite = oncitehover ? citationAtPos(doc, pos) : null;
						const person = onauthorhover ? personAtPos(doc, pos) : null;
						const heading = onheadinghover ? headingAtPos(doc, pos) : null;
						if (cite) {
							citeHoverTimer = setTimeout(() => {
								const coords = update.view.coordsAtPos(cite.from);
								if (coords) oncitehover!(cite.citeKey, { bottom: coords.bottom, left: coords.left });
							}, 700);
						} else if (person) {
							citeHoverTimer = setTimeout(() => {
								const coords = update.view.coordsAtPos(person.from);
								if (coords) onauthorhover!(person.name, { bottom: coords.bottom, left: coords.left });
							}, 700);
						} else if (heading) {
							citeHoverTimer = setTimeout(() => {
								const coords = update.view.coordsAtPos(pos);
								if (coords) onheadinghover!(heading, { bottom: coords.bottom, left: coords.left });
							}, 700);
						}
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
				},
				// Autocomplete dropdown — Tailwind preflight resets ul/li so we must restyle
				'.cm-tooltip': {
					zIndex: '50',
					border: '1px solid var(--color-paper-border, #D9CCBF)',
					borderRadius: '8px',
					boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
					overflow: 'hidden',
					backgroundColor: 'var(--color-paper, #FAF7F4)'
				},
				'.cm-tooltip-autocomplete ul': {
					margin: '0',
					padding: '4px',
					listStyle: 'none',
					maxHeight: '240px',
					overflowY: 'auto'
				},
				'.cm-tooltip-autocomplete ul li': {
					padding: '6px 10px',
					borderRadius: '5px',
					cursor: 'pointer',
					fontFamily: 'system-ui, sans-serif',
					fontSize: '13px',
					color: 'var(--color-ink, #2C1F14)',
					lineHeight: '1.4'
				},
				'.cm-tooltip-autocomplete ul li[aria-selected="true"]': {
					backgroundColor: 'var(--color-accent, #7C5C3E)',
					color: '#fff'
				}
			})
		];

		if (isDarkMode()) exts.push(oneDark);
		return exts;
	}

	// Ghost text (inline mention suggestion)
	const setGhostTextEffect = StateEffect.define<string | null>();

	class GhostWidget extends WidgetType {
		constructor(readonly text: string) { super(); }
		toDOM() {
			const span = document.createElement('span');
			span.className = 'cm-ghost-text';
			span.textContent = this.text;
			return span;
		}
		eq(other: GhostWidget) { return other.text === this.text; }
		ignoreEvent() { return true; }
	}

	const ghostTextField = StateField.define<{ text: string; pos: number } | null>({
		create: () => null,
		update(val, tr) {
			for (const e of tr.effects) {
				if (e.is(setGhostTextEffect)) return e.value ? { text: e.value, pos: tr.state.selection.main.head } : null;
			}
			// Clear ghost text on any document change
			if (tr.docChanged) return null;
			return val ? { text: val.text, pos: tr.newSelection.main.head } : null;
		},
		provide: f => EditorView.decorations.from(f, val => {
			if (!val) return Decoration.none;
			return Decoration.set([Decoration.widget({ widget: new GhostWidget(val.text), side: 1 }).range(val.pos)]);
		})
	});

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

		// Prevent browser focus cycling on Tab when mention dropdown is open.
		// Must be capture phase so it fires before the browser shifts focus.
		function onTabCapture(e: KeyboardEvent) {
			if (e.key === 'Tab' && wordGhostActive) e.preventDefault();
		}
		container.addEventListener('keydown', onTabCapture, { capture: true });

		const observer = new MutationObserver(rebuildView);
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
		return () => {
			container!.removeEventListener('keydown', onTabCapture, { capture: true });
			observer.disconnect();
		};
	});

	onDestroy(() => {
		view?.destroy();
		if (citeHoverTimer) clearTimeout(citeHoverTimer);
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

	export function setGhostText(text: string | null) {
		if (!view) return;
		view.dispatch({ effects: setGhostTextEffect.of(text) });
	}

	export function insertMention(name: string, from: number) {
		if (!view) return;
		const cursor = view.state.selection.main.head;
		const insert = `[[person:${name}]]`;
		view.dispatch({
			changes: { from, to: cursor, insert },
			selection: { anchor: from + insert.length }
		});
		view.focus();
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
{#if showLookupHint}
	<div class="mt-6 inline-flex items-center gap-1.5 rounded border border-paper-border px-2.5 py-1.5 dark:border-dark-paper-border">
		<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">@@ lookup unavailable —</span>
		<a href="/settings?tab=ai" class="font-sans text-xs text-ink-muted underline underline-offset-2 hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink">assign an AI model in Settings</a>
	</div>
{/if}

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
