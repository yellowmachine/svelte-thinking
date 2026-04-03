import { env } from '$env/dynamic/private';
import type { Db } from '$lib/server/db';
import { documentChunk } from '$lib/server/db/schemas/documentChunks.schema';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { eq } from 'drizzle-orm';

const EMBED_URL = env.EMBED_SERVICE_URL ?? 'http://localhost:3200';

// Split markdown text into chunks by paragraph (double newline).
// Skips very short chunks (headings, blank lines, etc.).
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
	const res = await fetch(`${EMBED_URL}/embed`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ input: texts })
	});
	if (!res.ok) throw new Error(`embed-service error: ${res.status}`);
	const data = (await res.json()) as { embeddings: number[][] };
	return data.embeddings;
}

/**
 * Construye el texto representativo de un perfil para embedding.
 * Concatena los campos que definen la identidad académica del usuario.
 */
export function buildProfileText(profile: {
	displayName?: string | null;
	institution?: string | null;
	bio?: string | null;
}): string {
	return [profile.displayName, profile.institution, profile.bio]
		.filter(Boolean)
		.join('\n');
}

/**
 * Indexa el perfil de un usuario como un único vector en user_profile.profileEmbedding.
 * Fire-and-forget: el caller no necesita await salvo en tests.
 */
export async function indexUserProfile(
	db: Db,
	userId: string,
	profileText: string
): Promise<void> {
	if (!profileText.trim()) return;
	const [embedding] = await embedTexts([profileText]);
	await db
		.update(userProfile)
		.set({ profileEmbedding: embedding })
		.where(eq(userProfile.userId, userId));
}

/**
 * Indexes a document's content into document_chunk rows.
 * Deletes existing chunks for the document before inserting new ones.
 * Should be called after commit or document creation.
 * Fire-and-forget: caller should not await unless testing.
 */
export async function indexDocument(
	db: Db,
	documentId: string,
	projectId: string,
	content: string
): Promise<void> {
	const chunks = chunkText(content);
	if (chunks.length === 0) {
		// No content worth indexing — clear any stale chunks
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
