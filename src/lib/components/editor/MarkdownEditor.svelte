<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { EditorView, keymap, highlightActiveLine, tooltips, Decoration, WidgetType, ViewPlugin, placeholder } from '@codemirror/view';
	import { EditorState, StateEffect, StateField } from '@codemirror/state';
	import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
	import { markdown } from '@codemirror/lang-markdown';
	import { oneDark } from '@codemirror/theme-one-dark';
	import { autocompletion, acceptCompletion, startCompletion, type CompletionContext, type Completion } from '@codemirror/autocomplete';
	import {
		commentRangesField,
		commentTheme,
		setCommentRanges,
		type CommentRange
	} from './commentsExtension';
	import { codeBlockExtension, codeLanguages } from './codeBlockExtension';
	import { epigraphCompletion } from './epigraphExtension';
	import { calloutCompletion } from './calloutExtension';
	import type { CiteRef } from '$lib/utils/citations';
	import { trpc } from '$lib/utils/trpc';
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
		onheadingprefix,
		onheadingprefixclear,
		onheadingghosttab,
		oncitehover,
		onauthorhover,
		onheadinghover,
		commentRanges = [],
		scrollToRange = null,
		completions = undefined,
		showLookupHint = false,
		spellLanguage = 'en-US',
		projectId = undefined
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
		/** Called when cursor is inside [[#partial — partial is text after [[#. */
		onheadingprefix?: (partial: string, from: number, cursorPos: number) => void;
		onheadingprefixclear?: () => void;
		/** Called when Tab/ArrowRight is pressed while heading-ghost is active. */
		onheadingghosttab?: () => boolean;
		/** Called when cursor dwells on a [[@citeKey]] token (debounced 700ms). */
		oncitehover?: (citeKey: string, coords: { bottom: number; left: number }) => void;
		/** Called when cursor dwells on a [[person:Name]] token (debounced 700ms). */
		onauthorhover?: (name: string, coords: { bottom: number; left: number }) => void;
		/** Called when cursor dwells on a heading line (debounced 700ms). */
		onheadinghover?: (info: { level: number; title: string; wordCount: number }, coords: { bottom: number; left: number }) => void;
		commentRanges?: CommentRange[];
		scrollToRange?: { from: number; to: number } | null;
		/** Which [[ completions to enable. undefined = all active. */
		completions?: Set<'wikilink' | 'citation' | 'heading' | 'footnote' | 'mention' | 'epigraph' | 'image' | 'callout'>;
		/** Show a footer hint that [[p lookup is unavailable (no AI key configured). */
		showLookupHint?: boolean;
		/** BCP-47 language tag for spell check (e.g. 'es-ES', 'en-US'). */
		spellLanguage?: string;
		/** Project ID — enables ![[ image autocomplete when provided. */
		projectId?: string;
	} = $props();

	let container: HTMLDivElement | null = null;
	let view: EditorView | null = null;
	let wordGhostActive = false;
	let headingGhostActive = false;
	let citeGhostActive = false;

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

	// [[!  → photo embed autocomplete ─────────────────────────────────────────

	type PhotoItem = { id: string; filename: string; description: string | null };
	let cachedPhotos: PhotoItem[] | null = null;
	let fetchingPhotos = false;

	async function loadPhotos(): Promise<PhotoItem[]> {
		if (cachedPhotos) return cachedPhotos;
		if (!projectId || fetchingPhotos) return [];
		fetchingPhotos = true;
		try {
			const rows = await trpc.photos.list.query(projectId);
			cachedPhotos = rows;
			return cachedPhotos;
		} catch {
			return [];
		} finally {
			fetchingPhotos = false;
		}
	}

	async function imageCompletion(context: CompletionContext) {
		const match = context.matchBefore(/\[\[![^\]]*$/);
		if (!match) return null;

		const typed = match.text.slice(3).toLowerCase(); // strip [[!
		const photos = await loadPhotos();
		if (photos.length === 0) return null;

		const filtered = typed
			? photos.filter(
					(p) =>
						p.filename.toLowerCase().includes(typed) ||
						p.description?.toLowerCase().includes(typed)
				)
			: photos;

		if (filtered.length === 0) return null;

		const options: Completion[] = filtered.map((p) => {
			const label = p.description || p.filename;
			return {
				label,
				detail: p.description ? p.filename : undefined,
				type: 'text',
				info: () => {
					const img = document.createElement('img');
					img.src = `/api/photos/${p.id}`;
					img.alt = label;
					img.style.cssText =
						'max-width:200px;max-height:150px;border-radius:4px;display:block;object-fit:cover;';
					const div = document.createElement('div');
					div.style.cssText = 'padding:6px';
					div.appendChild(img);
					return div;
				},
				apply: (view, _c, _from, to) => {
					const alt = p.description || p.filename;
					const insert = `![${alt}](/api/photos/${p.id})`;
					view.dispatch({ changes: { from: match.from, to, insert } });
				}
			};
		});

		return { from: match.from + 3, options };
	}

	function imageCompletionSource(context: CompletionContext) {
		const all = completions === undefined;
		if (!all && !completions.has('image')) return null;
		if (!projectId) return null;
		return imageCompletion(context);
	}

	// [[ dispatcher — character(s) after [[ determine completion type:
	//   [[doc:    → wikilinks / chapters      (inserts [[doc:id|title]])
	//   [[@       → bibliographic citations   (inserts [[@key]])
	//   [[#       → heading anchor            (inserts [[#Heading]])
	//   [[^       → footnote                  (inserts [^N] + definition)
	//   [[!       → photo embed               (handled above)
	//   [[p       → person mention / AI lookup (inserts [[person:Name]])

	function wikilinkCompletion(context: CompletionContext) {
		// Matches [[doc: followed by optional text
		const match = context.matchBefore(/\[\[doc:[^\]]*$/);
		if (!match) return null;

		const typed = match.text.slice(6).toLowerCase(); // strip [[doc:
		const options: Completion[] = chapters
			.filter((c) => !typed || c.title.toLowerCase().includes(typed))
			.map((c) => ({
				label: c.title,
				detail: 'chapter',
				apply: (view: EditorView, _c: unknown, _f: number, to: number) => {
					view.dispatch({ changes: { from: match.from, to, insert: `[[doc:${c.id}|${c.title}]]` } });
				}
			}));

		if (options.length === 0) return null;
		return { from: match.from + 6, options };
	}

	function citationCompletion(context: CompletionContext) {
		// Matches [[@citeKey  or  [[@citeKey:slugPartial
		const match = context.matchBefore(/\[\[@[\w.-]*(?::[\w-]*)?/);
		if (!match) return null;

		const typed = match.text.slice(3); // strip [[@
		const colonIdx = typed.indexOf(':');
		const options: Completion[] = [];

		if (colonIdx === -1) {
			// Typing citeKey — show matching root refs and their subnotes
			const filtered = references.filter(
				(r) => !typed || r.citeKey.toLowerCase().includes(typed.toLowerCase())
			);
			const showAbstract = filtered.length <= 5;

			for (const r of filtered) {
				const author = r.authors[0] ? `${r.authors[0].last}` : '';
				const year = r.year ?? '';
				const abstract = r.abstract?.trim() ?? null;

				options.push({
					label: r.citeKey,
					detail: [author, year].filter(Boolean).join(', '),
					info: showAbstract && abstract
						? () => {
							const wrap = document.createElement('div');
							const titleEl = document.createElement('div');
							titleEl.style.cssText = 'font-weight:600;margin-bottom:4px;font-size:0.85em;';
							titleEl.textContent = r.title;
							wrap.appendChild(titleEl);
							const absEl = document.createElement('div');
							absEl.style.cssText = 'font-size:0.8em;opacity:0.75;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;';
							absEl.textContent = abstract;
							wrap.appendChild(absEl);
							return wrap;
						}
						: r.title,
					apply: `@${r.citeKey}]]`
				});

				for (const sn of r.subnotes ?? []) {
					options.push({
						label: `${r.citeKey}:${sn.slug}`,
						detail: [author, year].filter(Boolean).join(', '),
						info: sn.notes || r.title,
						apply: `@${r.citeKey}:${sn.slug}]]`
					});
				}
			}
		} else {
			// Typing subnote slug — citeKey is fixed, filter by slug
			const citeKey = typed.slice(0, colonIdx);
			const slugPartial = typed.slice(colonIdx + 1).toLowerCase();
			const ref = references.find((r) => r.citeKey.toLowerCase() === citeKey.toLowerCase());

			if (ref) {
				const author = ref.authors[0] ? `${ref.authors[0].last}` : '';
				const year = ref.year ?? '';
				for (const sn of (ref.subnotes ?? []).filter(
					(s) => !slugPartial || s.slug.includes(slugPartial)
				)) {
					options.push({
						label: `${ref.citeKey}:${sn.slug}`,
						detail: [author, year].filter(Boolean).join(', '),
						info: sn.notes || ref.title,
						apply: `@${ref.citeKey}:${sn.slug}]]`
					});
				}
			}
		}

		if (options.length === 0) return null;
		// filter:false — CM6 would match labels against the text from `from` to cursor
		// which starts with '@', causing all options to be filtered out. We already
		// filter manually above so we suppress CM6's internal filtering.
		return { from: match.from + 2, options, filter: false };
	}

	function headingCompletion(context: CompletionContext) {
		const match = context.matchBefore(/\[\[#[^\]]*$/);
		if (!match) return null;

		const typed = match.text.slice(3).toLowerCase(); // strip [[#
		// Read from editor state directly — avoids stale closure over the `value` prop
		const doc = context.state.doc.toString();
		const options: Completion[] = [];
		for (const line of doc.split('\n')) {
			const m = line.match(/^(#{1,6})\s+(.+)$/);
			if (!m) continue;
			const text = m[2].trim();
			if (!typed || text.toLowerCase().includes(typed)) {
				options.push({
					label: text,
					detail: m[1], // heading level (##, ###…)
					// from is after [[#, so apply only needs the title + closing ]]
					apply: `${text}]]`
				});
			}
		}

		// from: match.from + 3 skips [[# so CM6 filters labels against the partial title,
		// not against [[# (which would filter everything out)
		const from = match.from + 3;

		if (options.length === 0) {
			return {
				from,
				options: [{ label: 'No headings in this document', detail: '', apply: '' }],
				validFor: /^[^\]]*$/
			};
		}
		return { from, options, validFor: /^[^\]]*$/ };
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

	// Returns the word in `name` that starts with `partial`, or the full name as fallback.
	// e.g. partial="Dawk", name="Richard Dawkins" → "Dawkins"
	function tokenNameFor(name: string, partial: string): string {
		const p = partial.toLowerCase();
		const word = name.split(/\s+/).find(w => w.toLowerCase().startsWith(p));
		return word ?? name;
	}

	async function mentionCompletion(context: CompletionContext) {
		const match = context.matchBefore(/\[\[p[\w\s.-]*/);
		if (!match || match.text.length < 4) return null; // need at least [[p + 1 char
		const partial = match.text.slice(3); // strip [[p
		if (!partial.trim()) return null;

		// Check document-local persons first (instant, no AI cost)
		const localRe = /\[\[person:([^\]]+)\]\]/g;
		const seen = new Set<string>();
		let m: RegExpExecArray | null;
		while ((m = localRe.exec(value)) !== null) seen.add(m[1]);
		const local = [...seen].filter(n =>
			n.split(/\s+/).some(w => w.toLowerCase().startsWith(partial.toLowerCase()))
		);

		// from: right after [[p so CM6 filters labels against the partial.
		// apply: function so the replacement covers the full [[ppartial (back to match.from).
		const from = match.from + 3;
		const mentionFrom = match.from;

		const toOption = (name: string) => {
			const word = tokenNameFor(name, partial);
			const insert = `[[person:${word}]]`;
			return {
				label: word,
				detail: word !== name ? name : undefined,
				type: 'variable' as const,
				apply: (view: EditorView, _c: unknown, _f: number, to: number) => {
					view.dispatch({ changes: { from: mentionFrom, to, insert } });
				}
			};
		};

		if (local.length > 0) {
			return { from, options: local.map(toOption) };
		}

		// No local match → AI lookup
		if (!onlookup) return null;
		const docContext = value.slice(Math.max(0, context.pos - 300), context.pos);
		const names = await onlookup(partial, docContext);
		if (names.length === 0) return null;

		return { from, options: names.map(toOption) };
	}

	function indexCompletion(context: CompletionContext) {
		const match = context.matchBefore(/\[\[i[a-z]*/);
		if (!match) return null;
		return {
			from: match.from,
			options: [{ label: '[[index:persons]]', detail: 'onomastic index', apply: '[[index:persons]]' }]
		};
	}

	function allCompletions(context: CompletionContext) {
		const all = completions === undefined;
		return (
			(all || completions.has('callout') ? calloutCompletion(context) : null) ??
			(all || completions.has('epigraph') ? epigraphCompletion(context) : null) ??
			(all || completions.has('citation') ? citationCompletion(context) : null) ??
			(all || completions.has('heading') ? headingCompletion(context) : null) ??
			(all || completions.has('footnote') ? footnoteCompletion(context) : null) ??
			(all || completions.has('wikilink') ? (wikilinkCompletion(context) ?? indexCompletion(context)) : null)
		);
	}

	function mentionCompletionSource(context: CompletionContext) {
		const all = completions === undefined;
		if (!all && !completions.has('mention')) return null;
		return mentionCompletion(context);
	}

	// .cm-scroller has overflow:visible so the page handles scrolling.
	// CM's built-in drag-autoscroll doesn't work in that case, so we implement it manually:
	// while the user holds the mouse button down inside the editor and moves near the
	// viewport edges, we scroll window proportionally.
	function dragAutoScroll() {
		return ViewPlugin.define((v) => {
			let dragging = false;
			let lastY = 0;
			let raf: number | null = null;

			function tick() {
				if (dragging) {
					const margin = 80;
					const vh = window.innerHeight;
					if (lastY < margin) {
						window.scrollBy(0, -Math.ceil((margin - lastY) / 5));
					} else if (lastY > vh - margin) {
						window.scrollBy(0, Math.ceil((lastY - (vh - margin)) / 5));
					}
				}
				raf = requestAnimationFrame(tick);
			}

			function onMouseDown(e: MouseEvent) {
				if (e.button === 0 && v.contentDOM.contains(e.target as Node)) dragging = true;
			}
			function onMouseMove(e: MouseEvent) { lastY = e.clientY; }
			function onMouseUp() { dragging = false; }

			document.addEventListener('mousedown', onMouseDown);
			document.addEventListener('mousemove', onMouseMove);
			document.addEventListener('mouseup', onMouseUp);
			raf = requestAnimationFrame(tick);

			return {
				destroy() {
					document.removeEventListener('mousedown', onMouseDown);
					document.removeEventListener('mousemove', onMouseMove);
					document.removeEventListener('mouseup', onMouseUp);
					if (raf !== null) cancelAnimationFrame(raf);
				}
			};
		});
	}

	function buildExtensions() {
		const exts = [
			history(),
			placeholder('Empieza a escribir…'),
			highlightActiveLine(),
			keymap.of([
				{
					key: 'Tab',
					run(view) {
						if (headingGhostActive) return onheadingghosttab?.() ?? false;
						if (wordGhostActive) return onwordghosttab?.() ?? false;
						return acceptCompletion(view);
					}
				},
				{
					key: 'ArrowRight',
					run(view) {
						if (headingGhostActive) return onheadingghosttab?.() ?? false;
						if (wordGhostActive) return onwordghosttab?.() ?? false;
						return acceptCompletion(view);
					}
				},
				...defaultKeymap,
				...historyKeymap,
			]),
			markdown({ codeLanguages }),
			tooltips({ position: 'fixed' }),
			autocompletion({ override: [allCompletions, mentionCompletionSource, imageCompletionSource], closeOnBlur: true }),
			...codeBlockExtension(),
			EditorView.lineWrapping,
			ghostTextField,
			spellHoverField,
			EditorView.baseTheme({
				'.cm-ghost-text': { color: 'var(--color-ink-faint, #aaa)', pointerEvents: 'none' },
				'.cm-spell-hover': { backgroundColor: 'oklch(92% 0.05 10 / 0.6)' },
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
				// Heading ghost text — cursor inside [[#partial
				if ((update.docChanged || update.selectionSet) && (onheadingprefix || onheadingprefixclear)) {
					const sel = update.state.selection.main;
					if (sel.empty) {
						const doc = update.state.doc.toString();
						const pos = sel.head;
						const lineStart = doc.lastIndexOf('\n', pos - 1) + 1;
						const textBefore = doc.slice(lineStart, pos);
						const hm = textBefore.match(/\[\[#([^\]]*)$/);
						if (hm) {
							const partial = hm[1];
							const from = pos - partial.length; // position right after [[#
							headingGhostActive = true;
							onheadingprefix?.(partial, from, pos);
						} else {
							headingGhostActive = false;
							onheadingprefixclear?.();
						}
					} else {
						headingGhostActive = false;
						onheadingprefixclear?.();
					}
				}
				// Word-level ghost text — capitalised mid-sentence word ≥3 chars
				// Skip if cursor is inside [[#... to avoid conflict with heading ghost
				if ((update.docChanged || update.selectionSet) && (onwordprefix || onwordprefixclear)) {
					const sel = update.state.selection.main;
					if (sel.empty) {
						const doc = update.state.doc.toString();
						const pos = sel.head;
						const lineStart = doc.lastIndexOf('\n', pos - 1) + 1;
						const textBefore = doc.slice(lineStart, pos);
						// Skip if inside [[#... context
						if (!textBefore.match(/\[\[#[^\]]*$/)) {
							// Walk back to find word start
							let wordFrom = pos;
							while (wordFrom > 0 && /\w/.test(doc[wordFrom - 1])) wordFrom--;
							const word = doc.slice(wordFrom, pos);
							// Must be ≥3 chars, start with uppercase, not inside [[person:...]]
							const charBefore = wordFrom > 0 ? doc[wordFrom - 1] : '';
							if (word.length >= 3 && /^[A-Z]/.test(word) && charBefore !== ':') {
								wordGhostActive = true;
								onwordprefix?.(word, wordFrom, pos);
							} else {
								wordGhostActive = false;
								onwordprefixclear?.();
							}
						}
					} else {
						wordGhostActive = false;
						onwordprefixclear?.();
					}
				}
				// Citation ghost text — cursor inside [[@partial
				if (update.docChanged || update.selectionSet) {
					const sel = update.state.selection.main;
					if (sel.empty && references.length > 0) {
						const doc = update.state.doc.toString();
						const pos = sel.head;
						const lineStart = doc.lastIndexOf('\n', pos - 1) + 1;
						const textBefore = doc.slice(lineStart, pos);
						const cm = textBefore.match(/\[\[@([\w.-]*)$/);
						if (cm) {
							const partial = cm[1].toLowerCase();
							const matched = references.find((r) =>
								r.citeKey.toLowerCase().startsWith(partial)
							);
							if (matched) {
								const suffix = matched.citeKey.slice(partial.length);
								const hasSubnotes = (matched.subnotes?.length ?? 0) > 0;
								citeGhostActive = true;
								update.view.dispatch({
									effects: setGhostTextEffect.of(suffix + (hasSubnotes ? ':' : ']]'))
								});
							} else if (citeGhostActive) {
								citeGhostActive = false;
								update.view.dispatch({ effects: setGhostTextEffect.of(null) });
							}
						} else if (citeGhostActive) {
							citeGhostActive = false;
							update.view.dispatch({ effects: setGhostTextEffect.of(null) });
						}
					} else if (citeGhostActive) {
						citeGhostActive = false;
						update.view.dispatch({ effects: setGhostTextEffect.of(null) });
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
				}
			}),
			dragAutoScroll()
		];

		// Trigger completion for non-word chars that CM6 activateOnTyping won't handle.
		// We use inputHandler (not keymap) so it fires regardless of keyboard layout —
		// keymap key names like '@' don't match on AltGr keyboards (Spanish, German…).
		exts.push(EditorView.inputHandler.of((view, from, to, insert) => {
			if (insert === '@' || insert === '#') {
				const before = view.state.doc.sliceString(Math.max(0, from - 2), from);
				if (before !== '[[') return false;
				view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + 1 } });
				startCompletion(view);
				return true;
			}
			if (insert === ':') {
				const before = view.state.doc.sliceString(Math.max(0, from - 50), from);
				if (!before.endsWith('[[doc') && !/\[\[@[\w.-]+$/.test(before)) return false;
				view.dispatch({ changes: { from, to, insert: ':' }, selection: { anchor: from + 1 } });
				startCompletion(view);
				return true;
			}
			return false;
		}));

		if (isDarkMode()) exts.push(oneDark);
		return exts;
	}

	// Spell hover highlight
	const setSpellHoverEffect = StateEffect.define<{ from: number; to: number } | null>();
	const spellHoverField = StateField.define<{ from: number; to: number } | null>({
		create: () => null,
		update(val, tr) {
			for (const e of tr.effects) if (e.is(setSpellHoverEffect)) return e.value;
			return val;
		},
		provide: f => EditorView.decorations.from(f, val => {
			if (!val) return Decoration.none;
			return Decoration.set([Decoration.mark({ class: 'cm-spell-hover' }).range(val.from, val.to)]);
		})
	});

	// Ghost text (inline mention suggestion)
	const setGhostTextEffect = StateEffect.define<string | null>();

	class GhostWidget extends WidgetType {
		text: string;
		constructor(text: string) { super(); this.text = text; }
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
		view.focus();
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

	export function setSpellHover(from: number, to: number) {
		if (!view) return;
		view.dispatch({ effects: setSpellHoverEffect.of({ from, to }) });
	}

	export function clearSpellHover() {
		if (!view) return;
		view.dispatch({ effects: setSpellHoverEffect.of(null) });
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
		<span class="font-sans text-xs text-ink-faint dark:text-dark-ink-faint">[[p lookup unavailable —</span>
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
