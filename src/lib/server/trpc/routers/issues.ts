import { z } from 'zod';
import { eq, asc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../init';
import { issue } from '$lib/server/db/schemas/issues.schema';

const issueStatusValues = ['open', 'in_progress', 'closed'] as const;
const issuePriorityValues = ['low', 'medium', 'high', 'critical'] as const;

export const issuesRouter = router({
	list: protectedProcedure.input(z.string()).query(async ({ ctx, input: projectId }) => {
		return ctx.withRLS((db) =>
			db
				.select()
				.from(issue)
				.where(eq(issue.projectId, projectId))
				.orderBy(asc(issue.createdAt))
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
	})
});
