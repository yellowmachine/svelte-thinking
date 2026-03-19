import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';

export interface CommentRange {
	id: string;
	from: number;
	to: number;
}

export const setCommentRanges = StateEffect.define<CommentRange[]>();

const commentMark = Decoration.mark({ class: 'cm-comment-highlight' });

export const commentRangesField = StateField.define<DecorationSet>({
	create: () => Decoration.none,
	update(deco, tr) {
		for (const effect of tr.effects) {
			if (effect.is(setCommentRanges)) {
				const valid = effect.value
					.filter((r) => r.from >= 0 && r.to > r.from)
					.sort((a, b) => a.from - b.from);
				return Decoration.set(valid.map((r) => commentMark.range(r.from, r.to)));
			}
		}
		return deco.map(tr.changes);
	},
	provide: (f) => EditorView.decorations.from(f)
});

export const commentTheme = EditorView.baseTheme({
	'.cm-comment-highlight': {
		backgroundColor: 'rgba(251, 191, 36, 0.2)',
		borderBottom: '2px solid rgba(251, 191, 36, 0.55)',
		cursor: 'pointer'
	}
});

/**
 * Finds where anchorText appears in doc, searching near the hint offset first.
 * Returns null if not found (orphaned comment).
 */
export function findAnchor(
	doc: string,
	anchorText: string,
	hint: number
): { from: number; to: number } | null {
	if (!anchorText) return null;
	const radius = 500;
	const start = Math.max(0, hint - radius);
	const end = Math.min(doc.length, hint + anchorText.length + radius);
	const slice = doc.slice(start, end);
	const idx = slice.indexOf(anchorText);
	if (idx !== -1) return { from: start + idx, to: start + idx + anchorText.length };
	// Fallback: global search
	const global = doc.indexOf(anchorText);
	if (global !== -1) return { from: global, to: global + anchorText.length };
	return null;
}

/** Converts a character offset to a 0-based line number */
export function posToLine(doc: string, pos: number): number {
	return doc.slice(0, pos).split('\n').length - 1;
}
