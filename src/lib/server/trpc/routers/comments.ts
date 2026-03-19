import { z } from 'zod';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../init';
import { comment } from '$lib/server/db/schemas/comments.schema';

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

	// Comentarios inline de un documento
	listInline: protectedProcedure.input(z.string()).query(async ({ ctx, input: documentId }) => {
		return ctx.withRLS((db) =>
			db
				.select()
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

	delete: protectedProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
		const rows = await ctx.withRLS((db) =>
			db.delete(comment).where(eq(comment.id, input)).returning({ id: comment.id })
		);

		// RLS solo permite delete si authorId = current_user
		if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
		return rows[0];
	})
});
