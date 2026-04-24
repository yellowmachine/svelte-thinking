import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../init';
import { tag, projectTag } from '$lib/server/db/schemas/tags.schema';

export const tagsRouter = router({
	list: protectedProcedure.query(({ ctx }) =>
		ctx.withRLS((db) =>
			db.select().from(tag).where(eq(tag.userId, ctx.user.id))
		)
	),

	listForProject: protectedProcedure.input(z.string()).query(({ ctx, input: projectId }) =>
		ctx.withRLS((db) =>
			db.select({ id: tag.id, name: tag.name })
				.from(projectTag)
				.innerJoin(tag, eq(tag.id, projectTag.tagId))
				.where(eq(projectTag.projectId, projectId))
		)
	),

	create: protectedProcedure
		.input(z.object({ name: z.string().min(1).max(50).trim() }))
		.mutation(async ({ ctx, input }) => {
			const id = crypto.randomUUID();
			await ctx.withRLS((db) =>
				db.insert(tag).values({ id, userId: ctx.user.id, name: input.name }).onConflictDoNothing()
			);
			const rows = await ctx.withRLS((db) =>
				db.select().from(tag).where(and(eq(tag.userId, ctx.user.id), eq(tag.name, input.name))).limit(1)
			);
			if (!rows[0]) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
			return rows[0];
		}),

	delete: protectedProcedure.input(z.string()).mutation(({ ctx, input: tagId }) =>
		ctx.withRLS((db) =>
			db.delete(tag).where(and(eq(tag.id, tagId), eq(tag.userId, ctx.user.id)))
		)
	),

	addToProject: protectedProcedure
		.input(z.object({ projectId: z.string(), tagId: z.string() }))
		.mutation(({ ctx, input }) =>
			ctx.withRLS((db) =>
				db.insert(projectTag).values(input).onConflictDoNothing()
			)
		),

	removeFromProject: protectedProcedure
		.input(z.object({ projectId: z.string(), tagId: z.string() }))
		.mutation(({ ctx, input }) =>
			ctx.withRLS((db) =>
				db.delete(projectTag).where(
					and(eq(projectTag.projectId, input.projectId), eq(projectTag.tagId, input.tagId))
				)
			)
		)
});
