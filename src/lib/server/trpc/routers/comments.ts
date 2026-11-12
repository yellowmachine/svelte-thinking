import { z } from 'zod';
import { eq, and, isNull, isNotNull, desc, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../init';
import { comment } from '$lib/server/db/schemas/comments.schema';
import { document } from '$lib/server/db/schemas/documents.schema';
import { project } from '$lib/server/db/schemas/projects.schema';
import { notificationRecipients } from '$lib/server/definerFunctions';
import { sendNewCommentNotification } from '$lib/server/email';
import { env } from '$env/dynamic/private';

import type { Db } from '$lib/server/db';

type WithRLS = <T>(fn: (db: Db) => Promise<T>) => Promise<T>;

async function notifyDocumentOwner(
	withRLS: WithRLS,
	documentId: string,
	commenterId: string,
	commenterName: string,
	commentContent: string
) {
	try {
		// As the commenter: RLS lets them read the document they just commented on,
		// and notification_recipients checks they are a member of the project.
		const found = await withRLS(async (db) => {
			const [doc] = await db
				.select({
					documentTitle: document.title,
					projectId: document.projectId,
					projectTitle: project.title
				})
				.from(document)
				.innerJoin(project, eq(document.projectId, project.id))
				.where(eq(document.id, documentId))
				.limit(1);
			if (!doc) return null;
			// Owner only; empty when the commenter is the owner.
			const [owner] = await notificationRecipients(db, doc.projectId, true);
			return owner ? { doc, owner } : null;
		});

		if (!found || found.owner.userId === commenterId || !found.owner.commentEmails) return;
		const { doc, owner } = found;

		const origin = env.ORIGIN ?? 'http://localhost:5174';
		const excerpt = commentContent.slice(0, 200) + (commentContent.length > 200 ? '…' : '');

		await sendNewCommentNotification({
			to: owner.email,
			authorName: commenterName,
			documentTitle: doc.documentTitle,
			projectTitle: doc.projectTitle,
			commentExcerpt: excerpt,
			documentUrl: `${origin}/projects/${doc.projectId}/documents/${documentId}`,
			unsubscribeUrl: `${origin}/notifications/unsubscribe/${owner.unsubscribeToken}`
		});
	} catch (e) {
		// Notificaciones son best-effort: nunca deben romper la mutación
		console.error('[notifications] Error sending comment notification:', e);
	}
}

const authorNameSql = (authorId: typeof comment.authorId) =>
	sql<string>`(SELECT name FROM "user" WHERE "user".id = ${authorId})`;

const createGeneralCommentSchema = z.object({
	documentId: z.string(),
	content: z.string().min(1).max(10000),
	parentCommentId: z.string().optional()
});

const createInlineCommentSchema = z.union([
	z.object({
		documentId: z.string(),
		content: z.string().min(1).max(10000),
		anchorText: z.string(),
		anchorContext: z.string().max(2000).optional(),
		lineStart: z.number().int().nonnegative(),
		lineEnd: z.number().int().nonnegative(),
		characterStart: z.number().int().nonnegative(),
		characterEnd: z.number().int().nonnegative(),
		paragraphNumber: z.undefined()
	}),
	z.object({
		documentId: z.string(),
		content: z.string().min(1).max(10000),
		paragraphNumber: z.number().int().positive(),
		anchorContext: z.string().max(2000).optional(),
		anchorText: z.undefined(),
		lineStart: z.undefined(),
		lineEnd: z.undefined(),
		characterStart: z.undefined(),
		characterEnd: z.undefined()
	})
]);

export const commentsRouter = router({
	// Comentarios generales de un documento (solo top-level, sin replies)
	list: protectedProcedure.input(z.string()).query(async ({ ctx, input: documentId }) => {
		return ctx.withRLS((db) =>
			db
				.select()
				.from(comment)
				.where(and(eq(comment.documentId, documentId), isNull(comment.parentCommentId)))
				.orderBy(desc(comment.createdAt))
		);
	}),

	// Comentarios inline de un documento con nombre de autor y replies
	listInline: protectedProcedure.input(z.string()).query(async ({ ctx, input: documentId }) => {
		const threads = await ctx.withRLS((db) =>
			db
				.select({
					id: comment.id,
					documentId: comment.documentId,
					authorId: comment.authorId,
					authorName: authorNameSql(comment.authorId),
					content: comment.content,
					anchorText: comment.anchorText,
					anchorContext: comment.anchorContext,
					lineStart: comment.lineStart,
					lineEnd: comment.lineEnd,
					characterStart: comment.characterStart,
					characterEnd: comment.characterEnd,
					paragraphNumber: comment.paragraphNumber,
					status: comment.status,
					createdAt: comment.createdAt
				})
				.from(comment)
				.where(
					and(
						eq(comment.documentId, documentId),
						eq(comment.type, 'inline'),
						isNull(comment.parentCommentId)
					)
				)
				.orderBy(comment.lineStart)
		);

		const replies = await ctx.withRLS((db) =>
			db
				.select({
					id: comment.id,
					parentCommentId: comment.parentCommentId,
					authorId: comment.authorId,
					authorName: authorNameSql(comment.authorId),
					content: comment.content,
					createdAt: comment.createdAt
				})
				.from(comment)
				.where(
					and(
						eq(comment.documentId, documentId),
						eq(comment.type, 'inline'),
						isNotNull(comment.parentCommentId)
					)
				)
				.orderBy(comment.createdAt)
		);

		const replyMap = new Map<string, typeof replies>();
		for (const r of replies) {
			if (!r.parentCommentId) continue;
			const list = replyMap.get(r.parentCommentId) ?? [];
			list.push(r);
			replyMap.set(r.parentCommentId, list);
		}

		return threads.map((t) => ({ ...t, replies: replyMap.get(t.id) ?? [] }));
	}),

	// Replies de un comentario
	replies: protectedProcedure.input(z.string()).query(async ({ ctx, input: parentId }) => {
		return ctx.withRLS((db) =>
			db
				.select()
				.from(comment)
				.where(eq(comment.parentCommentId, parentId))
				.orderBy(comment.createdAt)
		);
	}),

	createGeneral: protectedProcedure
		.input(createGeneralCommentSchema)
		.mutation(async ({ ctx, input }) => {
			const [created] = await ctx.withRLS((db) =>
				db
					.insert(comment)
					.values({
						id: crypto.randomUUID(),
						documentId: input.documentId,
						authorId: ctx.user.id,
						type: 'general',
						content: input.content,
						parentCommentId: input.parentCommentId
					})
					.returning()
			);

			// Solo notificar comentarios raíz, no replies
			if (!input.parentCommentId) {
				notifyDocumentOwner(
					ctx.withRLS,
					input.documentId,
					ctx.user.id,
					ctx.user.name ?? ctx.user.email,
					input.content
				);
			}

			return created;
		}),

	createInline: protectedProcedure
		.input(createInlineCommentSchema)
		.mutation(async ({ ctx, input }) => {
			const [created] = await ctx.withRLS((db) =>
				db
					.insert(comment)
					.values({
						id: crypto.randomUUID(),
						documentId: input.documentId,
						authorId: ctx.user.id,
						type: 'inline',
						content: input.content,
						anchorText: input.anchorText ?? null,
						anchorContext: input.anchorContext ?? null,
						lineStart: input.lineStart ?? null,
						lineEnd: input.lineEnd ?? null,
						characterStart: input.characterStart ?? null,
						characterEnd: input.characterEnd ?? null,
						paragraphNumber: input.paragraphNumber ?? null
					})
					.returning()
			);

			notifyDocumentOwner(
				ctx.withRLS,
				input.documentId,
				ctx.user.id,
				ctx.user.name ?? ctx.user.email,
				input.content
			);

			return created;
		}),

	update: protectedProcedure
		.input(z.object({ id: z.string(), content: z.string().min(1).max(10000) }))
		.mutation(async ({ ctx, input }) => {
			const rows = await ctx.withRLS((db) =>
				db
					.update(comment)
					.set({ content: input.content, updatedAt: new Date() })
					.where(eq(comment.id, input.id))
					.returning()
			);

			// RLS solo permite update si authorId = current_user — si no retorna nada, no era suyo
			if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
			return rows[0];
		}),

	resolve: protectedProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
		const rows = await ctx.withRLS((db) =>
			db
				.update(comment)
				.set({ status: 'resolved', updatedAt: new Date() })
				.where(and(eq(comment.id, input), isNull(comment.parentCommentId)))
				.returning()
		);

		if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
		return rows[0];
	}),

	reopen: protectedProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
		const rows = await ctx.withRLS((db) =>
			db
				.update(comment)
				.set({ status: 'open', updatedAt: new Date() })
				.where(and(eq(comment.id, input), isNull(comment.parentCommentId)))
				.returning()
		);

		if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
		return rows[0];
	}),

	addReply: protectedProcedure
		.input(z.object({ commentId: z.string(), content: z.string().min(1).max(10000) }))
		.mutation(async ({ ctx, input }) => {
			// Verify parent exists
			const [parent] = await ctx.withRLS((db) =>
				db
					.select({ id: comment.id, documentId: comment.documentId })
					.from(comment)
					.where(eq(comment.id, input.commentId))
					.limit(1)
			);
			if (!parent) throw new TRPCError({ code: 'NOT_FOUND' });

			const [created] = await ctx.withRLS((db) =>
				db
					.insert(comment)
					.values({
						id: crypto.randomUUID(),
						documentId: parent.documentId,
						authorId: ctx.user.id,
						type: 'inline',
						content: input.content,
						parentCommentId: input.commentId
					})
					.returning()
			);

			return {
				id: created.id,
				parentCommentId: created.parentCommentId,
				authorId: created.authorId,
				authorName: ctx.user.name ?? ctx.user.email,
				content: created.content,
				createdAt: created.createdAt
			};
		}),

	delete: protectedProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
		const rows = await ctx.withRLS((db) =>
			db.delete(comment).where(eq(comment.id, input)).returning({ id: comment.id })
		);

		// RLS solo permite delete si authorId = current_user
		if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
		return rows[0];
	})
});
