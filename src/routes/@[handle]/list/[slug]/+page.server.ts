import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { blogAggregator, blogAggregatorItem, blogPost } from '$lib/server/db/schemas/blog.schema';
import { excerptWithTruncation } from '$lib/server/blogExcerpt';

export const load: PageServerLoad = async ({ params }) => {
	const handle = params.handle.toLowerCase();

	const curatorRows = await db
		.select({
			userId: userProfile.userId,
			displayName: userProfile.displayName,
			handle: userProfile.handle
		})
		.from(userProfile)
		.where(eq(userProfile.handle, handle))
		.limit(1);
	if (!curatorRows[0]) error(404, 'Este blog no existe');
	const curator = curatorRows[0];

	const aggRows = await db
		.select({
			id: blogAggregator.id,
			slug: blogAggregator.slug,
			title: blogAggregator.title,
			description: blogAggregator.description
		})
		.from(blogAggregator)
		.where(and(eq(blogAggregator.userId, curator.userId), eq(blogAggregator.slug, params.slug)))
		.limit(1);
	if (!aggRows[0]) error(404, 'Esta lista no existe');
	const aggregator = aggRows[0];

	const items = await db
		.select({
			targetUserId: blogAggregatorItem.targetUserId,
			handle: userProfile.handle,
			displayName: userProfile.displayName
		})
		.from(blogAggregatorItem)
		.innerJoin(userProfile, eq(userProfile.userId, blogAggregatorItem.targetUserId))
		.where(eq(blogAggregatorItem.aggregatorId, aggregator.id));

	const targetUserIds = items.map((i) => i.targetUserId);

	const postRows = targetUserIds.length
		? await db
				.select({
					slug: blogPost.slug,
					title: blogPost.title,
					renderedHtml: blogPost.renderedHtml,
					publishedAt: blogPost.publishedAt,
					authorHandle: userProfile.handle,
					authorDisplayName: userProfile.displayName
				})
				.from(blogPost)
				.innerJoin(userProfile, eq(userProfile.userId, blogPost.userId))
				.where(inArray(blogPost.userId, targetUserIds))
				.orderBy(desc(blogPost.publishedAt))
				.limit(50)
		: [];

	const posts = postRows.map(({ renderedHtml, ...post }) => {
		const { text: excerpt, truncated } = excerptWithTruncation(renderedHtml, 200);
		return { ...post, excerpt, truncated };
	});

	const description =
		aggregator.description ||
		`Lista curada por @${curator.handle} con ${items.length} blog${items.length === 1 ? '' : 's'}.`;

	return { curator, aggregator, items, posts, description };
};
