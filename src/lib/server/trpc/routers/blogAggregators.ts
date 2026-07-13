import { z } from 'zod';
import { eq, and, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../init';
import { blogAggregator, blogAggregatorItem } from '$lib/server/db/schemas/blog.schema';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { slugify } from '$lib/utils/slug';

export const blogAggregatorsRouter = router({
	// Own aggregators + how many blogs each one currently includes
	listMine: protectedProcedure.query(async ({ ctx }) => {
		return ctx.withRLS((db) =>
			db
				.select({
					id: blogAggregator.id,
					slug: blogAggregator.slug,
					title: blogAggregator.title,
					description: blogAggregator.description,
					createdAt: blogAggregator.createdAt,
					itemCount: sql<number>`(
						SELECT count(*) FROM scholio.blog_aggregator_item
						WHERE blog_aggregator_item.aggregator_id = ${blogAggregator.id}
					)`
				})
				.from(blogAggregator)
				.where(eq(blogAggregator.userId, ctx.user.id))
				.orderBy(blogAggregator.createdAt)
		);
	}),

	// Blogs currently included in one of the current user's own aggregators
	listItems: protectedProcedure.input(z.string()).query(async ({ ctx, input: aggregatorId }) => {
		return ctx.withRLS((db) =>
			db
				.select({
					id: blogAggregatorItem.id,
					targetUserId: blogAggregatorItem.targetUserId,
					handle: userProfile.handle,
					displayName: userProfile.displayName,
					addedAt: blogAggregatorItem.addedAt
				})
				.from(blogAggregatorItem)
				.innerJoin(userProfile, eq(userProfile.userId, blogAggregatorItem.targetUserId))
				.where(eq(blogAggregatorItem.aggregatorId, aggregatorId))
				.orderBy(blogAggregatorItem.addedAt)
		);
	}),

	create: protectedProcedure
		.input(
			z.object({
				title: z.string().trim().min(1).max(80),
				description: z.string().max(500).optional()
			})
		)
		.mutation(async ({ ctx, input }) => {
			return ctx.withRLS(async (db) => {
				const existingSlugs = await db
					.select({ slug: blogAggregator.slug })
					.from(blogAggregator)
					.where(eq(blogAggregator.userId, ctx.user.id));
				const taken = new Set(existingSlugs.map((s) => s.slug));

				const base = slugify(input.title) || 'lista';
				let slug = base;
				let n = 2;
				while (taken.has(slug)) {
					slug = `${base}-${n}`;
					n++;
				}

				const id = crypto.randomUUID();
				await db.insert(blogAggregator).values({
					id,
					userId: ctx.user.id,
					slug,
					title: input.title,
					description: input.description ?? null
				});

				return { id, slug };
			});
		}),

	update: protectedProcedure
		.input(
			z.object({
				id: z.string(),
				title: z.string().trim().min(1).max(80),
				description: z.string().max(500).optional()
			})
		)
		.mutation(async ({ ctx, input }) => {
			const rows = await ctx.withRLS((db) =>
				db
					.update(blogAggregator)
					.set({
						title: input.title,
						description: input.description ?? null,
						updatedAt: new Date()
					})
					.where(eq(blogAggregator.id, input.id))
					.returning({ id: blogAggregator.id })
			);
			if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
			return { ok: true };
		}),

	delete: protectedProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
		const rows = await ctx.withRLS((db) =>
			db
				.delete(blogAggregator)
				.where(eq(blogAggregator.id, input))
				.returning({ id: blogAggregator.id })
		);
		if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
		return { ok: true };
	}),

	addBlog: protectedProcedure
		.input(z.object({ aggregatorId: z.string(), handle: z.string().trim().min(1) }))
		.mutation(async ({ ctx, input }) => {
			const handle = input.handle.replace(/^@/, '').toLowerCase();

			return ctx.withRLS(async (db) => {
				const [agg] = await db
					.select({ id: blogAggregator.id })
					.from(blogAggregator)
					.where(
						and(eq(blogAggregator.id, input.aggregatorId), eq(blogAggregator.userId, ctx.user.id))
					)
					.limit(1);
				if (!agg) throw new TRPCError({ code: 'NOT_FOUND' });

				const [target] = await db
					.select({
						userId: userProfile.userId,
						handle: userProfile.handle,
						displayName: userProfile.displayName
					})
					.from(userProfile)
					.where(eq(userProfile.handle, handle))
					.limit(1);
				if (!target) {
					throw new TRPCError({ code: 'NOT_FOUND', message: `No existe ningún blog @${handle}.` });
				}

				try {
					const [created] = await db
						.insert(blogAggregatorItem)
						.values({
							id: crypto.randomUUID(),
							aggregatorId: input.aggregatorId,
							targetUserId: target.userId
						})
						.returning();
					return { ...created, handle: target.handle, displayName: target.displayName };
				} catch {
					throw new TRPCError({
						code: 'CONFLICT',
						message: `@${handle} ya está en esta lista.`
					});
				}
			});
		}),

	removeItem: protectedProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
		const rows = await ctx.withRLS((db) =>
			db
				.delete(blogAggregatorItem)
				.where(eq(blogAggregatorItem.id, input))
				.returning({ id: blogAggregatorItem.id })
		);
		if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
		return { ok: true };
	})
});
