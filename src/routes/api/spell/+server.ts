import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { eq } from 'drizzle-orm';
import { userSpellAllowlist } from '$lib/server/db/schemas/users.schema';
import { SUPPORTED_SPELL_CODES } from '$lib/spell-languages';
import type { RequestHandler } from './$types';

const LANGUAGETOOL_URL = env.LANGUAGETOOL_URL ?? 'http://localhost:8010';

interface LtMatch {
	message: string;
	offset: number;
	length: number;
	replacements: { value: string }[];
	rule: { issueType: string };
}

// Strip Markdown syntax and build an offset map: cleanIndex → originalIndex
function stripMarkdown(md: string): { clean: string; map: number[] } {
	// Patterns to replace with spaces (preserving length mapping is complex,
	// so we replace tokens with spaces to keep offsets aligned)
	const map: number[] = [];
	const chars: string[] = [];

	// We do a character-by-character pass, masking markdown syntax with spaces
	// so that offsets in the clean text correspond 1:1 to the original.
	const masked = md
		// Inline code and code blocks → spaces
		.replace(/`{1,3}[\s\S]*?`{1,3}/g, (m) => ' '.repeat(m.length))
		// Wiki tokens: [[@key]], [[person:Name]], [[doc:...]], [[#...]]
		.replace(/\[\[[^\]]*\]\]/g, (m) => ' '.repeat(m.length))
		// Markdown links [text](url) → keep text, mask syntax
		.replace(/\[([^\]]*)\]\([^)]*\)/g, (m, text) =>
			' '.repeat(m.indexOf(text)) + text + ' '.repeat(m.length - m.indexOf(text) - text.length)
		)
		// Headings: strip leading #
		.replace(/^#{1,6}\s/gm, (m) => ' '.repeat(m.length))
		// Bold/italic markers
		.replace(/\*{1,3}|_{1,3}/g, (m) => ' '.repeat(m.length))
		// Footnotes [^1] or [^label]
		.replace(/\[\^[^\]]*\]/g, (m) => ' '.repeat(m.length))
		// HTML tags
		.replace(/<[^>]+>/g, (m) => ' '.repeat(m.length))
		// URLs
		.replace(/https?:\/\/\S+/g, (m) => ' '.repeat(m.length));

	// Build 1:1 map
	for (let i = 0; i < masked.length; i++) {
		if (masked[i] !== ' ' || md[i] === ' ') {
			map.push(i);
			chars.push(masked[i]);
		} else if (md[i] === ' ' || md[i] === '\n') {
			// Preserve actual whitespace
			map.push(i);
			chars.push(md[i]);
		}
		// masked spaces (were markdown syntax) — skip entirely, they don't exist in clean text
	}

	return { clean: chars.join(''), map };
}

export const POST: RequestHandler = async ({ request, locals }) => {
	// Must be authenticated
	if (!locals.user) throw error(401, 'Unauthorized');

	// Fetch user's allowlist
	const allowlistRows = await locals.withRLS((db: Parameters<typeof locals.withRLS>[0] extends (db: infer D) => unknown ? D : never) =>
		db.select({ word: userSpellAllowlist.word })
			.from(userSpellAllowlist)
			.where(eq(userSpellAllowlist.userId, locals.user!.id))
	) as { word: string }[];
	const allowlist = new Set(allowlistRows.map((r) => r.word.toLowerCase()));

	const body = await request.json();
	const { text, language = 'en-US' } = body as { text: string; language?: string };

	if (!text || typeof text !== 'string') throw error(400, 'Missing text');
	if (text.length > 20000) throw error(400, 'Text too long');

	const lang = SUPPORTED_SPELL_CODES.has(language) ? language : 'auto';

	const { clean, map } = stripMarkdown(text);

	const params = new URLSearchParams({
		language: lang,
		text: clean,
		disabledRules: 'WHITESPACE_RULE,UNPAIRED_BRACKETS'
	});

	let ltData: { matches: LtMatch[] };
	try {
		const res = await fetch(`${LANGUAGETOOL_URL}/v2/check`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: params.toString(),
			signal: AbortSignal.timeout(5000)
		});
		if (!res.ok) throw new Error(`LanguageTool error ${res.status}`);
		ltData = await res.json();
	} catch (e) {
		// LanguageTool unavailable — return empty matches gracefully
		return json({ matches: [] });
	}

	// Translate clean-text offsets back to original Markdown offsets, filtering allowlist
	const matches = ltData.matches
		.filter((m) => {
			const word = clean.slice(m.offset, m.offset + m.length).toLowerCase();
			return !allowlist.has(word);
		})
		.map((m) => ({
			from: map[m.offset] ?? m.offset,
			to: (map[m.offset + m.length - 1] ?? m.offset + m.length - 1) + 1,
			message: m.message,
			severity: m.rule.issueType === 'misspelling' ? 'error' : 'warning',
			replacements: m.replacements.slice(0, 5).map((r) => r.value)
		}));

	return json({ matches });
};
