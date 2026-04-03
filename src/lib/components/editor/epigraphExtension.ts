/**
 * Epigraph extension for CodeMirror.
 * Provides autocomplete for /epigraph slash command.
 * Registered via allCompletions in MarkdownEditor.svelte.
 */

import { type CompletionContext } from '@codemirror/autocomplete';

// ── Autocomplete for /epigraph slash command ──────────────────────────────────

export function epigraphCompletion(context: CompletionContext) {
	const match = context.matchBefore(/\/epigraph/);
	if (!match) return null;

	const template = `> [!epigraph]
> "Enter quote here"
> — Author Name
> Source (optional)`;

	return {
		from: match.from,
		options: [
			{
				label: '/epigraph',
				detail: 'Insert epigraph block',
				apply: template
			}
		]
	};
}
