import { env } from '$env/dynamic/private';
import { documentVersion } from '$lib/server/db/schemas/documents.schema';
import { eq } from 'drizzle-orm';
import type { Db } from '$lib/server/db';

/**
 * Documents shorter than this (chars) are sent verbatim to the agent instead of summarised.
 * ~3000 chars ≈ 500 words.
 */
export const SUMMARY_MIN_CHARS = 3000;

const SUMMARY_SYSTEM_PROMPT =
	'Generate a concise but comprehensive summary of the following academic document for use by an AI research assistant. ' +
	'Capture: main thesis or argument, key concepts, structure, and notable conclusions. ' +
	'Be factual and direct. Maximum 200 words. Write in English regardless of the document language.';

/**
 * Calls OpenRouter to summarise a document version and saves the result to
 * documentVersion.aiSummary. Returns early (silently) for short documents — callers
 * should include the full content directly in those cases.
 *
 * Fire-and-forget safe: all errors are caught internally.
 */
export async function generateAndSaveDocumentSummary(
	db: Db,
	versionId: string,
	content: string,
	title: string,
	docType: string,
	apiKey: string,
	model: string
): Promise<void> {
	if (content.trim().length < SUMMARY_MIN_CHARS) return;

	try {
		const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
				'HTTP-Referer': env.ORIGIN ?? 'http://localhost:5174',
				'X-Title': 'Scholio'
			},
			body: JSON.stringify({
				model,
				max_tokens: 400,
				messages: [
					{ role: 'system', content: SUMMARY_SYSTEM_PROMPT },
					{
						role: 'user',
						content: `Title: "${title}" (${docType})\n\n${content.slice(0, 8000)}`
					}
				]
			})
		});

		if (!res.ok) return;

		const data = (await res.json()) as { choices: { message: { content: string } }[] };
		const summary = data.choices[0]?.message?.content?.trim() ?? '';
		if (!summary) return;

		await db
			.update(documentVersion)
			.set({ aiSummary: summary })
			.where(eq(documentVersion.id, versionId));
	} catch {
		// Non-critical — agent falls back to metadata if no summary exists
	}
}
