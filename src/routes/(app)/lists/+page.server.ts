import type { PageServerLoad } from './$types';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { blogAggregator } from '$lib/server/db/schemas/blog.schema';
import { eq, desc, sql } from 'drizzle-orm';

export const load: PageServerLoad = async (event) => {
	const userId = event.locals.user!.id;

	const { handle, aggregators } = await event.locals.withRLS(async (db) => {
		const [profileRows, aggs] = await Promise.all([
			db
				.select({ handle: userProfile.handle })
				.from(userProfile)
				.where(eq(userProfile.userId, userId))
				.limit(1),
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
				.where(eq(blogAggregator.userId, userId))
				.orderBy(desc(blogAggregator.createdAt))
		]);

		return { handle: profileRows[0]?.handle ?? null, aggregators: aggs };
	});

	return { handle, aggregators };
};
