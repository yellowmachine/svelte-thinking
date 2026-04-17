/**
 * Callout block processing utilities
 * Syntax: > [!note], > [!warning], > [!tip], > [!caution]
 *
 * Example:
 *   > [!warning]
 *   > This API is deprecated. Use the new version instead.
 */

export type CalloutType = 'note' | 'warning' | 'tip' | 'caution';

const CALLOUT_TYPES: CalloutType[] = ['note', 'warning', 'tip', 'caution'];

const CALLOUT_PATTERN = new RegExp(
	`^>\\s*\\[!(${CALLOUT_TYPES.join('|')})\\]\\n((?:>\\s*.*\\n?)*)`,
	'gim'
);

export interface ParsedCallout {
	type: CalloutType;
	body: string;
}

const CALLOUT_LABELS: Record<CalloutType, string> = {
	note: 'Nota',
	warning: 'Atención',
	tip: 'Consejo',
	caution: 'Precaución'
};

const CALLOUT_ICONS: Record<CalloutType, string> = {
	note: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
	warning: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
	tip: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
	caution: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
};

export function extractCallouts(
	markdown: string
): { processed: string; callouts: Map<string, ParsedCallout> } {
	const callouts = new Map<string, ParsedCallout>();
	let idx = 0;

	const processed = markdown.replace(
		CALLOUT_PATTERN,
		(_match: string, type: string, body: string) => {
			const lines = body
				.split('\n')
				.filter((line: string) => line.trim().startsWith('>'))
				.map((line: string) => line.replace(/^\s*>\s?/, '').trimEnd())
				.filter(Boolean);

			const id = `callout-${idx++}`;
			callouts.set(id, { type: type.toLowerCase() as CalloutType, body: lines.join('\n') });
			return `<!--callout:${id}-->`;
		}
	);

	return { processed, callouts };
}

export function renderCalloutHTML(type: CalloutType, body: string): string {
	const label = CALLOUT_LABELS[type];
	const icon = CALLOUT_ICONS[type];
	const escapedBody = escapeHtml(body);

	return `<div class="callout callout-${type}" role="note">
  <div class="callout-header">${icon}<span class="callout-label">${label}</span></div>
  <div class="callout-body">${escapedBody}</div>
</div>`;
}

export function restoreCallouts(html: string, callouts: Map<string, ParsedCallout>): string {
	let result = html;
	for (const [id, data] of callouts.entries()) {
		result = result.replace(`<!--callout:${id}-->`, renderCalloutHTML(data.type, data.body));
	}
	return result;
}

function escapeHtml(text: string): string {
	const map: Record<string, string> = {
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#039;'
	};
	return text.replace(/[&<>"']/g, (char) => map[char]);
}
