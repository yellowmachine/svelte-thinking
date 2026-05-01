import type { PageServerLoad } from './$types';
import { project } from '$lib/server/db/schemas/projects.schema';
import { eq, sql } from 'drizzle-orm';
import { embedQuery } from '$lib/server/embeddings';

type ChunkRow = {
	text: string;
	document_id: string;
	title: string;
	type: string;
	similarity: number;
};

export const load: PageServerLoad = async (event) => {
	const projectId = event.params.id;
	const query = event.url.searchParams.get('q')?.trim() ?? '';

	const [proj] = (await event.locals.withRLS((db) =>
		db.select({ title: project.title }).from(project).where(eq(project.id, projectId)).limit(1)
	)) as { title: string }[];

	if (!query) {
		return { query, projectId, projectTitle: proj?.title ?? '', results: [] };
	}

	const queryVec = await embedQuery(query);
	const vecLiteral = `[${queryVec.join(',')}]`;

	const rows = (await event.locals.withRLS((db) =>
		db.execute(sql`
			SELECT dc.text, dc.document_id, d.title, d.type,
			       1 - (dc.embedding <=> ${vecLiteral}::vector) AS similarity
			FROM scholio.document_chunk dc
			JOIN scholio.document d ON d.id = dc.document_id
			WHERE dc.project_id = ${projectId}
			ORDER BY dc.embedding <=> ${vecLiteral}::vector
			LIMIT 40
		`)
	)) as unknown as ChunkRow[];

	// Keep best chunk per document (rows are already ordered by similarity desc)
	const seen = new Set<string>();
	const results = rows
		.filter((r) => {
			if (seen.has(r.document_id)) return false;
			seen.add(r.document_id);
			return true;
		})
		.slice(0, 10);

	return { query, projectId, projectTitle: proj?.title ?? '', results };
};
