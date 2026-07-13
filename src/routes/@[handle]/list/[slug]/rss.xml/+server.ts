import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { blogAggregator, blogAggregatorItem, blogPost } from '$lib/server/db/schemas/blog.schema';
import { excerptFromHtml } from '$lib/server/blogExcerpt';

function escapeXml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

export const GET: RequestHandler = async ({ params, url }) => {
	const handle = params.handle.toLowerCase();

	const curatorRows = await db
		.select({ userId: userProfile.userId, handle: userProfile.handle })
		.from(userProfile)
		.where(eq(userProfile.handle, handle))
		.limit(1);
	if (!curatorRows[0]) error(404, 'Este blog no existe');
	const curator = curatorRows[0];

	const aggRows = await db
		.select({ id: blogAggregator.id, slug: blogAggregator.slug, title: blogAggregator.title })
		.from(blogAggregator)
		.where(and(eq(blogAggregator.userId, curator.userId), eq(blogAggregator.slug, params.slug)))
		.limit(1);
	if (!aggRows[0]) error(404, 'Esta lista no existe');
	const aggregator = aggRows[0];

	const items = await db
		.select({ targetUserId: blogAggregatorItem.targetUserId })
		.from(blogAggregatorItem)
		.where(eq(blogAggregatorItem.aggregatorId, aggregator.id));
	const targetUserIds = items.map((i) => i.targetUserId);

	const posts = targetUserIds.length
		? await db
				.select({
					slug: blogPost.slug,
					title: blogPost.title,
					renderedHtml: blogPost.renderedHtml,
					publishedAt: blogPost.publishedAt,
					authorHandle: userProfile.handle
				})
				.from(blogPost)
				.innerJoin(userProfile, eq(userProfile.userId, blogPost.userId))
				.where(inArray(blogPost.userId, targetUserIds))
				.orderBy(desc(blogPost.publishedAt))
				.limit(50)
		: [];

	const origin = url.origin;
	const listUrl = `${origin}/@${curator.handle}/list/${aggregator.slug}`;
	const title = escapeXml(`${aggregator.title} — @${curator.handle}`);

	const rssItems = posts
		.map((post) => {
			const link = `${origin}/@${post.authorHandle}/${post.slug}`;
			const description = excerptFromHtml(post.renderedHtml, 300);
			return `
	<item>
		<title>${escapeXml(post.title)}</title>
		<link>${link}</link>
		<guid>${link}</guid>
		<description>${escapeXml(description)}</description>
		<pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>
	</item>`;
		})
		.join('');

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
	<title>${title}</title>
	<link>${listUrl}</link>
	<description>${title}</description>${rssItems}
</channel>
</rss>`;

	return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
