import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../init';
import { blogPost, blogPostComment } from '$lib/server/db/schemas/blog.schema';
import { runCommentModerationCheck } from '$lib/server/blogCommentModeration';

const moderateStatusSchema = z.enum(['approved', 'hidden', 'pending']);

export const blogCommentsRouter = router({
	// Full moderation queue for one of the current user's own posts (any status) —
	// RLS (blog_post_comment_owner_read) already restricts this to the post owner.
	listForModeration: protectedProcedure
		.input(z.string())
		.query(async ({ ctx, input: blogPostId }) => {
			return ctx.withRLS((db) =>
				db
					.select()
					.from(blogPostComment)
					.where(eq(blogPostComment.blogPostId, blogPostId))
					.orderBy(desc(blogPostComment.createdAt))
			);
		}),

	create: protectedProcedure
		.input(z.object({ blogPostId: z.string(), content: z.string().trim().min(1).max(5000) }))
		.mutation(async ({ ctx, input }) => {
			const [post] = await ctx.withRLS((db) =>
				db
					.select({ commentsEnabled: blogPost.commentsEnabled })
					.from(blogPost)
					.where(eq(blogPost.id, input.blogPostId))
					.limit(1)
			);
			if (!post) throw new TRPCError({ code: 'NOT_FOUND' });
			if (!post.commentsEnabled) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'Los comentarios están desactivados en esta publicación.'
				});
			}

			// Best-effort — only runs if the commenting user has their own AI key
			// configured (BYOK). Never blocks the comment; only flags it for the
			// post author's review queue.
			const check = await runCommentModerationCheck(
				ctx.withRLS,
				ctx.db,
				ctx.user.id,
				input.content
			);

			const [created] = await ctx.withRLS((db) =>
				db
					.insert(blogPostComment)
					.values({
						id: crypto.randomUUID(),
						blogPostId: input.blogPostId,
						authorId: ctx.user.id,
						content: input.content,
						aiFlagged: check?.flagged ?? false,
						aiReason: check?.reason ?? null
					})
					.returning()
			);

			return created;
		}),

	moderate: protectedProcedure
		.input(z.object({ commentId: z.string(), status: moderateStatusSchema }))
		.mutation(async ({ ctx, input }) => {
			const rows = await ctx.withRLS((db) =>
				db
					.update(blogPostComment)
					.set({ status: input.status, updatedAt: new Date() })
					.where(eq(blogPostComment.id, input.commentId))
					.returning()
			);
			// RLS (blog_post_comment_moderate) only allows the post owner — empty means not theirs
			if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
			return rows[0];
		}),

	delete: protectedProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
		const rows = await ctx.withRLS((db) =>
			db
				.delete(blogPostComment)
				.where(eq(blogPostComment.id, input))
				.returning({ id: blogPostComment.id })
		);
		// RLS (blog_post_comment_delete) allows the comment author or the post owner
		if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
		return rows[0];
	})
});
