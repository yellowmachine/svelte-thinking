import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { document, documentVersion } from '$lib/server/db/schemas/documents.schema';
import { documentLink } from '$lib/server/db/schemas/documentLinks.schema';
import { projectContextLink } from '$lib/server/db/schemas/contextLinks.schema';
import { project } from '$lib/server/db/schemas/projects.schema';
import { comment } from '$lib/server/db/schemas/comments.schema';
import { eq, and, isNull, isNotNull, sql } from 'drizzle-orm';

export const load: PageServerLoad = async (event) => {
	const { id: projectId, docId } = event.params;

	const [docResult, projectResult, inlineComments, projectDocs, backlinks, externalDocs] = await Promise.all([
		// Document + content
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

		// Project title
		event.locals.withRLS((db) =>
			db
				.select({ id: project.id, title: project.title })
				.from(project)
				.where(eq(project.id, projectId))
				.limit(1)
		),

		// Inline comments + replies
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
		}),

		// All documents in project (for wikilink resolution in preview)
		event.locals.withRLS((db) =>
			db
				.select({ id: document.id, title: document.title, projectId: document.projectId })
				.from(document)
				.where(eq(document.projectId, projectId))
		) as Promise<{ id: string; title: string; projectId: string }[]>,

		// Backlinks: documents that [[link]] to this one
		event.locals.withRLS((db) =>
			db
				.select({ id: document.id, title: document.title })
				.from(documentLink)
				.innerJoin(document, eq(document.id, documentLink.sourceDocumentId))
				.where(eq(documentLink.targetDocumentId, docId))
		) as Promise<{ id: string; title: string }[]>,

		// External context docs linked to this project (for [[title:hash]] resolution)
		event.locals.withRLS((db) =>
			db
				.select({ id: document.id, title: document.title, projectId: document.projectId })
				.from(projectContextLink)
				.innerJoin(document, eq(document.id, projectContextLink.linkedDocumentId))
				.where(eq(projectContextLink.projectId, projectId))
		) as Promise<{ id: string; title: string; projectId: string }[]>
	]);

	if (!docResult) error(404, 'Documento no encontrado');

	return {
		document: docResult,
		projectTitle: projectResult[0]?.title ?? '',
		inlineComments,
		currentUserId: event.locals.user!.id,
		projectDocs,
		backlinks,
		externalDocs
	};
};
