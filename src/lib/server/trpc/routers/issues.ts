import { z } from 'zod';
import { eq, asc, isNull, isNotNull, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../init';
import { issue } from '$lib/server/db/schemas/issues.schema';
import { issueComment } from '$lib/server/db/schemas/issueComments.schema';

const issueStatusValues = ['open', 'in_progress', 'closed'] as const;
const issuePriorityValues = ['low', 'medium', 'high', 'critical'] as const;

export const issuesRouter = router({
	list: protectedProcedure.input(z.string()).query(async ({ ctx, input: projectId }) => {
		return ctx.withRLS((db) =>
			db.select().from(issue).where(eq(issue.projectId, projectId)).orderBy(asc(issue.createdAt))
		);
	}),

	byId: protectedProcedure.input(z.string()).query(async ({ ctx, input }) => {
		const rows = await ctx.withRLS((db) =>
			db.select().from(issue).where(eq(issue.id, input)).limit(1)
		);
		if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
		return rows[0];
	}),

	create: protectedProcedure
		.input(
			z.object({
				projectId: z.string(),
				title: z.string().min(1).max(255),
				content: z.string().optional(),
				status: z.enum(issueStatusValues).optional().default('open'),
				priority: z.enum(issuePriorityValues).optional().default('medium'),
				isPrivate: z.boolean().optional().default(false)
			})
		)
		.mutation(async ({ ctx, input }) => {
			const [created] = await ctx.withRLS((db) =>
				db
					.insert(issue)
					.values({
						id: crypto.randomUUID(),
						projectId: input.projectId,
						title: input.title,
						content: input.content ?? null,
						status: input.status,
						priority: input.priority,
						isPrivate: input.isPrivate,
						ownerUserId: ctx.user.id
					})
					.returning()
			);
			return created;
		}),

	update: protectedProcedure
		.input(
			z.object({
				id: z.string(),
				title: z.string().min(1).max(255).optional(),
				content: z.string().nullable().optional(),
				status: z.enum(issueStatusValues).optional(),
				priority: z.enum(issuePriorityValues).optional(),
				isPrivate: z.boolean().optional()
			})
		)
		.mutation(async ({ ctx, input }) => {
			const { id, ...data } = input;
			const rows = await ctx.withRLS((db) =>
				db
					.update(issue)
					.set({ ...data, updatedAt: new Date() })
					.where(eq(issue.id, id))
					.returning()
			);
			if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
			return rows[0];
		}),

	delete: protectedProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
		const rows = await ctx.withRLS((db) =>
			db.delete(issue).where(eq(issue.id, input)).returning({ id: issue.id })
		);
		if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
		return rows[0];
	}),

	// ── Comments ──────────────────────────────────────────────────────────────

	listComments: protectedProcedure.input(z.string()).query(async ({ ctx, input: issueId }) => {
		const authorName = sql<string>`(SELECT name FROM "user" WHERE "user".id = ${issueComment.authorId})`;

		const threads = await ctx.withRLS((db) =>
			db
				.select({
					id: issueComment.id,
					issueId: issueComment.issueId,
					authorId: issueComment.authorId,
					authorName,
					content: issueComment.content,
					createdAt: issueComment.createdAt,
					updatedAt: issueComment.updatedAt
				})
				.from(issueComment)
				.where(eq(issueComment.issueId, issueId) && isNull(issueComment.parentCommentId))
				.orderBy(asc(issueComment.createdAt))
		);

		const replies = await ctx.withRLS((db) =>
			db
				.select({
					id: issueComment.id,
					parentCommentId: issueComment.parentCommentId,
					authorId: issueComment.authorId,
					authorName,
					content: issueComment.content,
					createdAt: issueComment.createdAt
				})
				.from(issueComment)
				.where(eq(issueComment.issueId, issueId) && isNotNull(issueComment.parentCommentId))
				.orderBy(asc(issueComment.createdAt))
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

	addComment: protectedProcedure
		.input(
			z.object({
				issueId: z.string(),
				projectId: z.string(),
				content: z.string().min(1).max(10000),
				parentCommentId: z.string().optional()
			})
		)
		.mutation(async ({ ctx, input }) => {
			const authorName = sql<string>`(SELECT name FROM "user" WHERE "user".id = ${ctx.user.id})`;

			const [created] = await ctx.withRLS((db) =>
				db
					.insert(issueComment)
					.values({
						id: crypto.randomUUID(),
						issueId: input.issueId,
						projectId: input.projectId,
						authorId: ctx.user.id,
						content: input.content,
						parentCommentId: input.parentCommentId ?? null
					})
					.returning()
			);

			return {
				...created,
				authorName: ctx.user.name ?? ctx.user.email,
				replies: [] as []
			};
		}),

	deleteComment: protectedProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
		const rows = await ctx.withRLS((db) =>
			db.delete(issueComment).where(eq(issueComment.id, input)).returning({ id: issueComment.id })
		);
		if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
		return rows[0];
	})
});
