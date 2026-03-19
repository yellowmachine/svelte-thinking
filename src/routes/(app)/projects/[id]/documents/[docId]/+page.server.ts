import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { document, documentVersion } from '$lib/server/db/schemas/documents.schema';
import { project } from '$lib/server/db/schemas/projects.schema';
import { comment } from '$lib/server/db/schemas/comments.schema';
import { eq, and, isNull, isNotNull, sql } from 'drizzle-orm';

export const load: PageServerLoad = async (event) => {
	const { id: projectId, docId } = event.params;

	const [docResult, projectResult, inlineComments] = await Promise.all([
		event.locals.withRLS(async (db) => {
			const docs = await db.select().from(document).where(eq(document.id, docId)).limit(1);
			if (!docs[0]) return null;
			const doc = docs[0];

			if (doc.draftContent !== null) {
				return { ...doc, content: doc.draftContent, hasDraft: true };
			}

			if (!doc.currentVersionId) {
				return { ...doc, content: '', hasDraft: false };
			}

			const versions = await db
				.select()
				.from(documentVersion)
				.where(eq(documentVersion.id, doc.currentVersionId))
				.limit(1);

			return { ...doc, content: versions[0]?.content ?? '', hasDraft: false };
		}),
		event.locals.withRLS((db) =>
			db
				.select({ id: project.id, title: project.title })
				.from(project)
				.where(eq(project.id, projectId))
				.limit(1)
		),
		event.locals.withRLS(async (db) => {
			const threads = await db
				.select({
					id: comment.id,
					authorId: comment.authorId,
					authorName: sql<string>`(SELECT name FROM "user" WHERE "user".id = ${comment.authorId})`,
					content: comment.content,
					anchorText: comment.anchorText,
					lineStart: comment.lineStart,
					characterStart: comment.characterStart,
					characterEnd: comment.characterEnd,
					status: comment.status,
					createdAt: comment.createdAt
				})
				.from(comment)
				.where(
					and(
						eq(comment.documentId, docId),
						eq(comment.type, 'inline'),
						isNull(comment.parentCommentId)
					)
				)
				.orderBy(comment.lineStart);

			const replies = await db
				.select({
					id: comment.id,
					parentCommentId: comment.parentCommentId,
					authorId: comment.authorId,
					authorName: sql<string>`(SELECT name FROM "user" WHERE "user".id = ${comment.authorId})`,
					content: comment.content,
					createdAt: comment.createdAt
				})
				.from(comment)
				.where(
					and(
						eq(comment.documentId, docId),
						eq(comment.type, 'inline'),
						isNotNull(comment.parentCommentId)
					)
				)
				.orderBy(comment.createdAt);

			const replyMap = new Map<string, typeof replies>();
			for (const r of replies) {
				if (!r.parentCommentId) continue;
				const list = replyMap.get(r.parentCommentId) ?? [];
				list.push(r);
				replyMap.set(r.parentCommentId, list);
			}

			return threads.map((t) => ({ ...t, replies: replyMap.get(t.id) ?? [] }));
		})
	]);

	if (!docResult) error(404, 'Documento no encontrado');

	return {
		document: docResult,
		projectTitle: projectResult[0]?.title ?? '',
		inlineComments,
		currentUserId: event.locals.user!.id
	};
};
