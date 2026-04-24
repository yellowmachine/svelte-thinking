import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { project, projectCollaborator } from '$lib/server/db/schemas/projects.schema';
import { document, documentVersion, documentVersionShare } from '$lib/server/db/schemas/documents.schema';
import { comment } from '$lib/server/db/schemas/comments.schema';
import { projectInvitation } from '$lib/server/db/schemas/invitations.schema';
import { projectRequirement } from '$lib/server/db/schemas/requirements.schema';
import { tag, projectTag } from '$lib/server/db/schemas/tags.schema';
import { eq, desc, and, count, sql, inArray, isNull, gt } from 'drizzle-orm';

export const load: PageServerLoad = async (event) => {
	const projectId = event.params.id;
	const userId = event.locals.user!.id;

	const [proj, documents, collaborators, invitations, requirementCounts, openCommentsCount, docCommentCounts] = await Promise.all([
		event.locals.withRLS((db) =>
			db.select().from(project).where(eq(project.id, projectId)).limit(1)
		),
		event.locals.withRLS(async (db) => {
			const docs = await db
				.select()
				.from(document)
				.where(eq(document.projectId, projectId))
				.orderBy(desc(document.updatedAt));

			// For book documents without an active draft, load committed content
			// so isChapterReferenced can check actual published state
			const booksNeedingContent = docs.filter(
				(d) => d.type === 'book' && d.draftContent === null && d.currentVersionId !== null
			);

			if (booksNeedingContent.length === 0) {
				return docs.map((d) => ({ ...d, bookContent: d.draftContent ?? '' }));
			}

			const versions = await db
				.select({ id: documentVersion.id, content: documentVersion.content })
				.from(documentVersion)
				.where(inArray(documentVersion.id, booksNeedingContent.map((b) => b.currentVersionId!)));

			const versionById = new Map(versions.map((v) => [v.id, v.content]));

			return docs.map((d) => ({
				...d,
				bookContent:
					d.type === 'book'
						? (d.draftContent ?? (d.currentVersionId ? (versionById.get(d.currentVersionId) ?? '') : ''))
						: ''
			}));
		}),
		// withRLS: owner policy allows seeing all collaborators; collaborator policy shows own row
		event.locals.withRLS((db) =>
			db
				.select({
					id: projectCollaborator.id,
					userId: projectCollaborator.userId,
					role: projectCollaborator.role,
					createdAt: projectCollaborator.createdAt,
					name: sql<string>`(SELECT name FROM "user" WHERE "user".id = ${projectCollaborator.userId})`,
					email: sql<string>`(SELECT email FROM "user" WHERE "user".id = ${projectCollaborator.userId})`
				})
				.from(projectCollaborator)
				.where(eq(projectCollaborator.projectId, projectId))
		),
		event.locals.withRLS((db) =>
			db
				.select()
				.from(projectInvitation)
				.where(
					and(eq(projectInvitation.projectId, projectId), eq(projectInvitation.status, 'pending'))
				)
				.orderBy(desc(projectInvitation.createdAt))
		),
		event.locals.withRLS((db) =>
			db
				.select({
					total: count(),
					fulfilled: count(projectRequirement.fulfilledDocumentId),
					requiredTotal: sql<number>`count(*) filter (where ${projectRequirement.required} = true)`,
					requiredFulfilled: sql<number>`count(${projectRequirement.fulfilledDocumentId}) filter (where ${projectRequirement.required} = true)`
				})
				.from(projectRequirement)
				.where(eq(projectRequirement.projectId, projectId))
		) as Promise<{ total: number; fulfilled: number; requiredTotal: number; requiredFulfilled: number }[]>,

		event.locals.withRLS((db) =>
			db
				.select({ value: count() })
				.from(comment)
				.innerJoin(document, eq(document.id, comment.documentId))
				.where(
					and(
						eq(document.projectId, projectId),
						eq(comment.status, 'open'),
						isNull(comment.parentCommentId)
					)
				)
		),

		event.locals.withRLS((db) =>
			db
				.select({ documentId: comment.documentId, value: count() })
				.from(comment)
				.innerJoin(document, eq(document.id, comment.documentId))
				.where(
					and(
						eq(document.projectId, projectId),
						eq(comment.status, 'open'),
						isNull(comment.parentCommentId)
					)
				)
				.groupBy(comment.documentId)
		)
	]);

	if (!proj[0]) error(404, 'Proyecto no encontrado');

	const myRole = collaborators.find((c) => c.userId === userId)?.role ?? null;
	const isOwner = proj[0].ownerId === userId;

	const reqCounts = (requirementCounts as { total: number; fulfilled: number; requiredTotal: number; requiredFulfilled: number }[])[0] ?? { total: 0, fulfilled: 0, requiredTotal: 0, requiredFulfilled: 0 };

	const openCommentsByDoc = Object.fromEntries(
		docCommentCounts.map((r) => [r.documentId, r.value])
	);

	// Documentos con shares activos (solo para owners)
	let activeShareDocumentIds = new Set<string>();
	if (isOwner) {
		const now = new Date();
		const shareRows = await event.locals.withRLS((db) =>
			db
				.selectDistinct({ documentId: documentVersionShare.documentId })
				.from(documentVersionShare)
				.innerJoin(document, eq(document.id, documentVersionShare.documentId))
				.where(
					and(
						eq(document.projectId, projectId),
						eq(document.ownerUserId, userId),
						isNull(documentVersionShare.revokedAt),
						gt(documentVersionShare.expiresAt, now)
					)
				)
		);
		activeShareDocumentIds = new Set(shareRows.map((r) => r.documentId));
	}

	const projectTags = await event.locals.withRLS((db) =>
		db.select({ id: tag.id, name: tag.name })
			.from(projectTag)
			.innerJoin(tag, eq(tag.id, projectTag.tagId))
			.where(eq(projectTag.projectId, projectId))
	);

	return {
		project: proj[0],
		documents,
		collaborators,
		invitations,
		myRole,
		isOwner,
		currentUserId: userId,
		requirementCounts: reqCounts,
		openComments: openCommentsCount[0]?.value ?? 0,
		openCommentsByDoc,
		activeShareDocumentIds: [...activeShareDocumentIds],
		projectTags
	};
};
