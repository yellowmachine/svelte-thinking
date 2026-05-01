/**
 * Callout extension for CodeMirror.
 * Provides autocomplete for /note, /warning, /tip, /caution slash commands.
 * Registered via allCompletions in MarkdownEditor.svelte.
 */

import { type CompletionContext } from '@codemirror/autocomplete';

const CALLOUTS = [
	{ command: '/note', type: 'note', detail: 'Insert note block' },
	{ command: '/warning', type: 'warning', detail: 'Insert warning block' },
	{ command: '/tip', type: 'tip', detail: 'Insert tip block' },
	{ command: '/caution', type: 'caution', detail: 'Insert caution block' }
] as const;

export function calloutCompletion(context: CompletionContext) {
	const match = context.matchBefore(/\/(note|warning|tip|caution)/);
	if (!match) return null;

	return {
		from: match.from,
		options: CALLOUTS.map(({ command, type, detail }) => ({
			label: command,
			detail,
			apply: `> [!${type}]\n> `
		}))
	};
}
