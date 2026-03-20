import { z } from 'zod';
import { eq, and, isNull, isNotNull, desc, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../init';
import { comment } from '$lib/server/db/schemas/comments.schema';
import { document } from '$lib/server/db/schemas/documents.schema';
import { project } from '$lib/server/db/schemas/projects.schema';
import { notificationPreference } from '$lib/server/db/schemas/users.schema';
import { sendNewCommentNotification } from '$lib/server/resend';
import { env } from '$env/dynamic/private';

import type { Db } from '$lib/server/db';

async function notifyDocumentOwner(
	db: Db,
	documentId: string,
	commenterId: string,
	commenterName: string,
	commentContent: string
) {
	try {
		// Fetch document + project + owner email in one query (bypasses RLS via ctx.db)
		const rows = await db
			.select({
				documentTitle: document.title,
				projectId: document.projectId,
				projectTitle: project.title,
				ownerId: project.ownerId,
				ownerEmail: sql<string>`(SELECT email FROM "user" WHERE "user".id = ${project.ownerId})`
			})
			.from(document)
			.innerJoin(project, eq(document.projectId, project.id))
			.where(eq(document.id, documentId))
			.limit(1);

		const row = rows[0];
		if (!row || row.ownerId === commenterId) return; // no notificar al propio autor

		// Get or create notification preference
		const existingPref = await db
			.select()
			.from(notificationPreference)
			.where(
				and(
					eq(notificationPreference.userId, row.ownerId),
					eq(notificationPreference.projectId, row.projectId)
				)
			)
			.limit(1);

		let pref = existingPref[0];
		if (!pref) {
			const [created] = await db
				.insert(notificationPreference)
				.values({
					id: crypto.randomUUID(),
					userId: row.ownerId,
					projectId: row.projectId,
					unsubscribeToken: crypto.randomUUID()
				})
				.returning();
			pref = created;
		}

		if (!pref.commentEmails) return;

		const origin = env.ORIGIN ?? 'http://localhost:5174';
		const excerpt = commentContent.slice(0, 200) + (commentContent.length > 200 ? '…' : '');

		await sendNewCommentNotification({
			to: row.ownerEmail,
			authorName: commenterName,
			documentTitle: row.documentTitle,
			projectTitle: row.projectTitle,
			commentExcerpt: excerpt,
			documentUrl: `${origin}/projects/${row.projectId}/documents/${documentId}`,
			unsubscribeUrl: `${origin}/notifications/unsubscribe/${pref.unsubscribeToken}`
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

const createInlineCommentSchema = z.object({
	documentId: z.string(),
	content: z.string().min(1).max(10000),
	anchorText: z.string(),
	lineStart: z.number().int().nonnegative(),
	lineEnd: z.number().int().nonnegative(),
	characterStart: z.number().int().nonnegative(),
	characterEnd: z.number().int().nonnegative()
});

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
					lineStart: comment.lineStart,
					lineEnd: comment.lineEnd,
					characterStart: comment.characterStart,
					characterEnd: comment.characterEnd,
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
					ctx.db,
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
						anchorText: input.anchorText,
						lineStart: input.lineStart,
						lineEnd: input.lineEnd,
						characterStart: input.characterStart,
						characterEnd: input.characterEnd
					})
					.returning()
			);

			notifyDocumentOwner(
				ctx.db,
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
				db.select({ id: comment.id, documentId: comment.documentId }).from(comment).where(eq(comment.id, input.commentId)).limit(1)
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
