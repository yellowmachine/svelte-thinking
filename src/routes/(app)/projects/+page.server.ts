import type { PageServerLoad } from './$types';
import { project } from '$lib/server/db/schemas/projects.schema';
import { document, documentVersionShare } from '$lib/server/db/schemas/documents.schema';
import { tag, projectTag } from '$lib/server/db/schemas/tags.schema';
import { desc, sql, eq, and, isNull, gt } from 'drizzle-orm';

export const load: PageServerLoad = async (event) => {
	const currentUserId = event.locals.user!.id;

	const projects = await event.locals.withRLS((db) =>
		db
			.select({
				id: project.id,
				title: project.title,
				description: project.description,
				status: project.status,
				orgId: project.orgId,
				ownerId: project.ownerId,
				updatedAt: project.updatedAt,
				scheduledDeleteAt: project.scheduledDeleteAt,
				collaboratorCount:
					sql<number>`(SELECT COUNT(*)::int FROM project_collaborator WHERE project_collaborator.project_id = ${project.id})`.as(
						'collaborator_count'
					),
				openComments:
					sql<number>`(SELECT COUNT(*)::int FROM comment JOIN document ON comment.document_id = document.id WHERE document.project_id = project.id AND comment.status = 'open' AND comment.parent_comment_id IS NULL)`.as(
						'open_comments'
					),
				openIssues:
					sql<number>`(SELECT COUNT(*)::int FROM issue WHERE issue.project_id = project.id AND issue.status = 'open')`.as(
						'open_issues'
					)
			})
			.from(project)
			.orderBy(desc(project.updatedAt))
	);

	// Proyectos owned que tienen al menos un share activo
	const now = new Date();
	const ownedProjectIds = projects
		.filter((p) => p.ownerId === currentUserId)
		.map((p) => p.id);

	let activeShareProjectIds = new Set<string>();
	if (ownedProjectIds.length > 0) {
		const rows = await event.locals.withRLS((db) =>
			db
				.selectDistinct({ projectId: document.projectId })
				.from(documentVersionShare)
				.innerJoin(document, eq(document.id, documentVersionShare.documentId))
				.where(
					and(
						eq(document.ownerUserId, currentUserId),
						isNull(documentVersionShare.revokedAt),
						gt(documentVersionShare.expiresAt, now)
					)
				)
		);
		activeShareProjectIds = new Set(rows.map((r) => r.projectId));
	}

	// All tags for the user + which projects each tag belongs to
	const allTags = await event.locals.withRLS((db) =>
		db.select({ id: tag.id, name: tag.name }).from(tag).where(eq(tag.userId, currentUserId))
	);
	const tagLinks = await event.locals.withRLS((db) =>
		db.select({ projectId: projectTag.projectId, tagId: projectTag.tagId }).from(projectTag)
	);

	return {
		projects,
		currentUserId,
		activeShareProjectIds: [...activeShareProjectIds],
		allTags,
		tagLinks
	};
};
