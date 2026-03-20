import type { PageServerLoad } from './$types';
import { document } from '$lib/server/db/schemas/documents.schema';
import { documentLink } from '$lib/server/db/schemas/documentLinks.schema';
import { project } from '$lib/server/db/schemas/projects.schema';
import { eq, sql } from 'drizzle-orm';

export const load: PageServerLoad = async (event) => {
	const userId = event.locals.user!.id;

	const [outgoing, incoming] = await Promise.all([
		// Outgoing: links FROM my documents TO anywhere
		event.locals.withRLS((db) =>
			db
				.select({
					linkId: documentLink.id,
					fromDocId: documentLink.sourceDocumentId,
					fromDocTitle: sql<string>`src.title`,
					fromProjectId: sql<string>`src_proj.id`,
					fromProjectTitle: sql<string>`src_proj.title`,
					toDocId: documentLink.targetDocumentId,
					toDocTitle: sql<string>`tgt.title`,
					toDocIsPublic: sql<boolean>`tgt.is_public`,
					toProjectId: sql<string>`tgt_proj.id`,
					toProjectTitle: sql<string>`tgt_proj.title`,
					toDocOwnedByMe: sql<boolean>`tgt_proj.owner_id = ${userId}`
				})
				.from(documentLink)
				.innerJoin(sql`document src`, sql`src.id = ${documentLink.sourceDocumentId}`)
				.innerJoin(sql`project src_proj`, sql`src_proj.id = src.project_id`)
				.innerJoin(sql`document tgt`, sql`tgt.id = ${documentLink.targetDocumentId}`)
				.innerJoin(sql`project tgt_proj`, sql`tgt_proj.id = tgt.project_id`)
				.where(sql`src_proj.owner_id = ${userId}`)
				.orderBy(sql`src_proj.title`, sql`src.title`, sql`tgt.title`)
		) as Promise<{
			linkId: string;
			fromDocId: string;
			fromDocTitle: string;
			fromProjectId: string;
			fromProjectTitle: string;
			toDocId: string;
			toDocTitle: string;
			toDocIsPublic: boolean;
			toProjectId: string;
			toProjectTitle: string;
			toDocOwnedByMe: boolean;
		}[]>,

		// Incoming: links TO my documents FROM public documents of other users
		event.locals.withRLS((db) =>
			db
				.select({
					linkId: documentLink.id,
					fromDocId: documentLink.sourceDocumentId,
					fromDocTitle: sql<string>`src.title`,
					fromDocIsPublic: sql<boolean>`src.is_public`,
					fromProjectId: sql<string>`src_proj.id`,
					fromProjectTitle: sql<string>`src_proj.title`,
					toDocId: documentLink.targetDocumentId,
					toDocTitle: sql<string>`tgt.title`,
					toProjectId: sql<string>`tgt_proj.id`,
					toProjectTitle: sql<string>`tgt_proj.title`
				})
				.from(documentLink)
				.innerJoin(sql`document src`, sql`src.id = ${documentLink.sourceDocumentId}`)
				.innerJoin(sql`project src_proj`, sql`src_proj.id = src.project_id`)
				.innerJoin(sql`document tgt`, sql`tgt.id = ${documentLink.targetDocumentId}`)
				.innerJoin(sql`project tgt_proj`, sql`tgt_proj.id = tgt.project_id`)
				.where(sql`tgt_proj.owner_id = ${userId} AND src_proj.owner_id != ${userId} AND src.is_public = true`)
				.orderBy(sql`src_proj.title`, sql`src.title`)
		) as Promise<{
			linkId: string;
			fromDocId: string;
			fromDocTitle: string;
			fromDocIsPublic: boolean;
			fromProjectId: string;
			fromProjectTitle: string;
			toDocId: string;
			toDocTitle: string;
			toProjectId: string;
			toProjectTitle: string;
		}[]>
	]);

	return { outgoing, incoming };
};
