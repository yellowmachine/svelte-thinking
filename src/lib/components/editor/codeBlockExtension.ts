/**
 * CodeMirror extension that:
 * 1. Enables per-language syntax highlighting inside fenced code blocks.
 * 2. Shows a floating toolbar when the cursor is inside a fenced block:
 *    - Language selector (edits the info string in the markdown source)
 *    - "Open in…" button for supported languages
 */
import { StateField, StateEffect } from '@codemirror/state';
import { EditorView, ViewPlugin, showTooltip, type Tooltip } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { languages } from '@codemirror/language-data';

// ── Supported languages list ──────────────────────────────────────────────────

export const SUPPORTED_LANGUAGES = [
	{ label: 'Plain text', value: '' },
	{ label: 'Python', value: 'python' },
	{ label: 'JavaScript', value: 'javascript' },
	{ label: 'TypeScript', value: 'typescript' },
	{ label: 'Rust', value: 'rust' },
	{ label: 'Go', value: 'go' },
	{ label: 'C', value: 'c' },
	{ label: 'C++', value: 'cpp' },
	{ label: 'Java', value: 'java' },
	{ label: 'Julia', value: 'julia' },
	{ label: 'R', value: 'r' },
	{ label: 'SQL', value: 'sql' },
	{ label: 'Shell', value: 'bash' },
	{ label: 'JSON', value: 'json' },
	{ label: 'YAML', value: 'yaml' },
	{ label: 'HTML', value: 'html' },
	{ label: 'CSS', value: 'css' }
] as const;

// ── "Open in…" links ──────────────────────────────────────────────────────────

const OPEN_IN: Record<string, (code: string) => string | null> = {
	python: (code) =>
		`https://pythontutor.com/render.html#code=${encodeURIComponent(code)}&mode=display&origin=opt-frontend.js&py=3`,
	javascript: (code) =>
		`https://jsfiddle.net/?js=${encodeURIComponent(code)}`,
	rust: (code) =>
		`https://play.rust-lang.org/?code=${encodeURIComponent(code)}&edition=2021`,
	go: (code) =>
		`https://go.dev/play/?code=${encodeURIComponent(code)}`,
	cpp: (code) =>
		`https://godbolt.org/#g:!((g:!((g:!((h:codeEditor,i:(filename:'1',fontScale:14,fontUsePx:'0',j:1,lang:c%2B%2B,selection:(endColumn:1,endLineNumber:1,positionColumn:1,positionLineNumber:1,selectionStartColumn:1,selectionStartLineNumber:1,startColumn:1,startLineNumber:1),source:'${encodeURIComponent(code)}'),l:'5',n:'0',o:'C%2B%2B+source+%231',t:'0')),k:50,l:'4',n:'0',o:'',s:0,t:'0')),version:4)`,
	c: (code) =>
		`https://godbolt.org/#g:!((g:!((g:!((h:codeEditor,i:(filename:'1',fontScale:14,fontUsePx:'0',j:1,lang:c,selection:(endColumn:1,endLineNumber:1,positionColumn:1,positionLineNumber:1,selectionStartColumn:1,selectionStartLineNumber:1,startColumn:1,startLineNumber:1),source:'${encodeURIComponent(code)}'),l:'5',n:'0',o:'C+source+%231',t:'0')),k:50,l:'4',n:'0',o:'',s:0,t:'0')),version:4)`
};

// ── State: cursor position relative to fenced code blocks ─────────────────────

export interface CodeBlockInfo {
	/** Position of the opening fence (start of the ``` line) */
	fenceFrom: number;
	/** Language tag in the info string, e.g. "python". Empty string if none. */
	language: string;
	/** The code content (between fences, excluding the fence lines) */
	code: string;
	/** Position of the info string node (to replace on language change) */
	infoFrom: number;
	infoTo: number;
}

export const codeBlockField = StateField.define<CodeBlockInfo | null>({
	create: () => null,
	update(_, tr) {
		const pos = tr.state.selection.main.head;
		const tree = syntaxTree(tr.state);
		let found: CodeBlockInfo | null = null;

		tree.cursor().iterate((node) => {
			if (node.name !== 'FencedCode') return;
			if (pos < node.from || pos > node.to) return;

			let language = '';
			let infoFrom = node.from;
			let infoTo = node.from;
			let codeFrom = node.from;
			let codeTo = node.to;

			// Walk children to find CodeInfo (language tag) and CodeText
			const inner = node.node.cursor();
			if (inner.firstChild()) {
				do {
					if (inner.name === 'CodeInfo') {
						language = tr.state.doc.sliceString(inner.from, inner.to).trim();
						infoFrom = inner.from;
						infoTo = inner.to;
					}
					if (inner.name === 'CodeText') {
						codeFrom = inner.from;
						codeTo = inner.to;
					}
				} while (inner.nextSibling());
			}

			const code = tr.state.doc.sliceString(codeFrom, codeTo);
			found = { fenceFrom: node.from, language, code, infoFrom, infoTo };
		});

		return found;
	}
});

// ── Tooltip showing language selector + Open In button ────────────────────────

function buildTooltipDOM(view: EditorView, info: CodeBlockInfo): HTMLElement {
	const wrap = document.createElement('div');
	wrap.className = 'cm-code-toolbar';

	// Language selector
	const select = document.createElement('select');
	select.className = 'cm-code-lang-select';

	for (const lang of SUPPORTED_LANGUAGES) {
		const opt = document.createElement('option');
		opt.value = lang.value;
		opt.textContent = lang.label;
		if (lang.value === info.language) opt.selected = true;
		select.appendChild(opt);
	}

	select.addEventListener('change', () => {
		const newLang = select.value;
		view.dispatch({
			changes: { from: info.infoFrom, to: info.infoTo, insert: newLang }
		});
		view.focus();
	});

	wrap.appendChild(select);

	// "Open in…" button — only if a handler exists for this language
	const openFn = OPEN_IN[info.language];
	if (openFn) {
		const url = openFn(info.code);
		if (url) {
			const btn = document.createElement('a');
			btn.href = url;
			btn.target = '_blank';
			btn.rel = 'noopener noreferrer';
			btn.className = 'cm-code-open-btn';
			btn.textContent = '↗ Abrir en ' + getServiceName(info.language);
			wrap.appendChild(btn);
		}
	}

	return wrap;
}

function getServiceName(lang: string): string {
	const map: Record<string, string> = {
		python: 'Python Tutor',
		javascript: 'JSFiddle',
		rust: 'Rust Playground',
		go: 'Go Playground',
		cpp: 'Godbolt',
		c: 'Godbolt'
	};
	return map[lang] ?? 'playground';
}

export const codeBlockTooltip = StateField.define<readonly Tooltip[]>({
	create: () => [],
	update(_, tr) {
		const info = tr.state.field(codeBlockField);
		if (!info) return [];

		return [
			{
				pos: info.fenceFrom,
				above: true,
				strictSide: false,
				arrow: false,
				create: (view) => ({ dom: buildTooltipDOM(view, info) })
			}
		];
	},
	provide: (f) => showTooltip.computeN([f], (state) => state.field(f))
});

// ── Tooltip styles ────────────────────────────────────────────────────────────

export const codeToolbarTheme = EditorView.theme({
	'.cm-tooltip': {
		border: 'none',
		background: 'transparent',
		boxShadow: 'none'
	},
	'.cm-code-toolbar': {
		display: 'flex',
		alignItems: 'center',
		gap: '8px',
		padding: '4px 6px',
		borderRadius: '6px',
		background: 'var(--color-paper-ui, #EDE8DF)',
		border: '1px solid var(--color-paper-border, #D4C9B8)',
		boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
		fontSize: '12px',
		fontFamily: 'ui-sans-serif, system-ui, sans-serif'
	},
	'.cm-code-lang-select': {
		background: 'transparent',
		border: 'none',
		outline: 'none',
		color: 'var(--color-ink-muted, #7A6A58)',
		cursor: 'pointer',
		fontSize: '12px',
		fontFamily: 'inherit',
		padding: '0'
	},
	'.cm-code-open-btn': {
		color: 'var(--color-accent, #7C5C3E)',
		textDecoration: 'none',
		fontSize: '12px',
		fontFamily: 'inherit',
		borderLeft: '1px solid var(--color-paper-border, #D4C9B8)',
		paddingLeft: '8px',
		'&:hover': { textDecoration: 'underline' }
	}
});

// ── Language data for markdown() codeLanguages option ────────────────────────

export { languages as codeLanguages };

// ── Convenience: all extensions bundled ──────────────────────────────────────

export function codeBlockExtension() {
	return [codeBlockField, codeBlockTooltip, codeToolbarTheme];
}
