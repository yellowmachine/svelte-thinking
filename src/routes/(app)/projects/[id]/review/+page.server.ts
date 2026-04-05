import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { project } from '$lib/server/db/schemas/projects.schema';
import { document } from '$lib/server/db/schemas/documents.schema';
import { comment } from '$lib/server/db/schemas/comments.schema';
import { eq, and, isNull, isNotNull, sql } from 'drizzle-orm';

export const load: PageServerLoad = async (event) => {
	const { id: projectId } = event.params;

	const [projectResult, threads, replies] = await Promise.all([
		event.locals.withRLS((db) =>
			db
				.select({ id: project.id, title: project.title, ownerId: project.ownerId })
				.from(project)
				.where(eq(project.id, projectId))
				.limit(1)
		),

		// All open top-level inline+general comments across all documents in the project
		event.locals.withRLS((db) =>
			db
				.select({
					id: comment.id,
					documentId: comment.documentId,
					documentTitle: sql<string>`(SELECT title FROM scholio.document WHERE document.id = ${comment.documentId})`,
					authorId: comment.authorId,
					authorName: sql<string>`(SELECT name FROM "user" WHERE "user".id = ${comment.authorId})`,
					content: comment.content,
					anchorText: comment.anchorText,
					paragraphNumber: comment.paragraphNumber,
					type: comment.type,
					status: comment.status,
					createdAt: comment.createdAt
				})
				.from(comment)
				.innerJoin(document, eq(document.id, comment.documentId))
				.where(
					and(
						eq(document.projectId, projectId),
						eq(comment.status, 'open'),
						isNull(comment.parentCommentId)
					)
				)
				.orderBy(document.title, comment.createdAt)
		),

		// Replies for those threads
		event.locals.withRLS((db) =>
			db
				.select({
					id: comment.id,
					parentCommentId: comment.parentCommentId,
					authorId: comment.authorId,
					authorName: sql<string>`(SELECT name FROM "user" WHERE "user".id = ${comment.authorId})`,
					content: comment.content,
					createdAt: comment.createdAt
				})
				.from(comment)
				.innerJoin(document, eq(document.id, comment.documentId))
				.where(
					and(
						eq(document.projectId, projectId),
						eq(comment.status, 'open'),
						isNotNull(comment.parentCommentId)
					)
				)
				.orderBy(comment.createdAt)
		)
	]);

	if (!projectResult[0]) error(404, 'Project not found');

	// Attach replies to threads
	const replyMap = new Map<string, typeof replies>();
	for (const r of replies) {
		if (!r.parentCommentId) continue;
		const list = replyMap.get(r.parentCommentId) ?? [];
		list.push(r);
		replyMap.set(r.parentCommentId, list);
	}

	const threadsWithReplies = threads.map((t) => ({
		...t,
		replies: replyMap.get(t.id) ?? []
	}));

	// Group by document
	const byDocument = new Map<string, { documentId: string; documentTitle: string; threads: typeof threadsWithReplies }>();
	for (const t of threadsWithReplies) {
		if (!byDocument.has(t.documentId)) {
			byDocument.set(t.documentId, { documentId: t.documentId, documentTitle: t.documentTitle, threads: [] });
		}
		byDocument.get(t.documentId)!.threads.push(t);
	}

	return {
		project: projectResult[0],
		documents: Array.from(byDocument.values()),
		currentUserId: event.locals.user!.id
	};
};
