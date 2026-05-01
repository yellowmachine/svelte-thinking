import { env } from '$env/dynamic/private';
import type { Db } from '$lib/server/db';
import { documentChunk } from '$lib/server/db/schemas/documentChunks.schema';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { eq } from 'drizzle-orm';

const EMBED_MODEL = 'text-embedding-3-small';

function chunkText(text: string): string[] {
	return text
		.split(/\n\n+/)
		.map((s) => s.trim())
		.filter((s) => s.length > 40);
}

export async function embedQuery(text: string): Promise<number[]> {
	const [vec] = await embedTexts([text]);
	return vec;
}

async function embedTexts(texts: string[]): Promise<number[][]> {
	if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set');
	const res = await fetch('https://api.openai.com/v1/embeddings', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${env.OPENAI_API_KEY}`
		},
		body: JSON.stringify({ model: EMBED_MODEL, input: texts })
	});
	if (!res.ok) throw new Error(`OpenAI embeddings error: ${res.status}`);
	const data = (await res.json()) as { data: { embedding: number[]; index: number }[] };
	return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export function buildProfileText(profile: {
	displayName?: string | null;
	institution?: string | null;
	bio?: string | null;
}): string {
	return [profile.displayName, profile.institution, profile.bio].filter(Boolean).join('\n');
}

export async function indexUserProfile(db: Db, userId: string, profileText: string): Promise<void> {
	if (!profileText.trim()) return;
	const [embedding] = await embedTexts([profileText]);
	await db
		.update(userProfile)
		.set({ profileEmbedding: embedding })
		.where(eq(userProfile.userId, userId));
}

export async function indexDocument(
	db: Db,
	documentId: string,
	projectId: string,
	content: string
): Promise<void> {
	const chunks = chunkText(content);
	if (chunks.length === 0) {
		await db.delete(documentChunk).where(eq(documentChunk.documentId, documentId));
		return;
	}

	const embeddings = await embedTexts(chunks);

	await db.delete(documentChunk).where(eq(documentChunk.documentId, documentId));

	await db.insert(documentChunk).values(
		chunks.map((text, i) => ({
			id: crypto.randomUUID(),
			documentId,
			projectId,
			chunkIndex: i,
			text,
			embedding: embeddings[i]
		}))
	);
}
