import type { PageServerLoad } from './$types';
import { eq, desc, isNotNull, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { blogAggregator } from '$lib/server/db/schemas/blog.schema';

export const load: PageServerLoad = async () => {
	// Ordered by last-published DESC NULLS LAST — active blogs always sort
	// before handle-only-no-posts-yet ones, so filtering after the LIMIT below
	// never drops an active blog in favor of an inactive one.
	const blogRows = await db
		.select({
			userId: userProfile.userId,
			handle: userProfile.handle,
			displayName: userProfile.displayName,
			bio: userProfile.bio,
			postCount: sql<number>`(
				SELECT count(*) FROM scholio.blog_post WHERE blog_post.user_id = ${userProfile.userId}
			)`,
			lastPublishedAt: sql<string | null>`(
				SELECT max(published_at) FROM scholio.blog_post WHERE blog_post.user_id = ${userProfile.userId}
			)`
		})
		.from(userProfile)
		.where(isNotNull(userProfile.handle))
		.orderBy(
			sql`(
				SELECT max(published_at) FROM scholio.blog_post WHERE blog_post.user_id = ${userProfile.userId}
			) DESC NULLS LAST`
		)
		.limit(100);

	const blogs = blogRows.filter((b) => b.postCount > 0);

	const listRows = await db
		.select({
			id: blogAggregator.id,
			slug: blogAggregator.slug,
			title: blogAggregator.title,
			description: blogAggregator.description,
			curatorHandle: userProfile.handle,
			curatorDisplayName: userProfile.displayName,
			createdAt: blogAggregator.createdAt,
			itemCount: sql<number>`(
				SELECT count(*) FROM scholio.blog_aggregator_item
				WHERE blog_aggregator_item.aggregator_id = ${blogAggregator.id}
			)`
		})
		.from(blogAggregator)
		.innerJoin(userProfile, eq(userProfile.userId, blogAggregator.userId))
		.orderBy(desc(blogAggregator.createdAt))
		.limit(50);

	const lists = listRows.filter((l) => l.itemCount > 0);

	return { blogs, lists };
};
