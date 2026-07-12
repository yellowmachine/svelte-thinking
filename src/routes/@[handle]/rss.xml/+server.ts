import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq, desc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { blogPost } from '$lib/server/db/schemas/blog.schema';

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

	const profileRows = await db
		.select({
			userId: userProfile.userId,
			displayName: userProfile.displayName,
			handle: userProfile.handle
		})
		.from(userProfile)
		.where(eq(userProfile.handle, handle))
		.limit(1);
	if (!profileRows[0]) error(404, 'Este blog no existe');
	const author = profileRows[0];

	const posts = await db
		.select({
			slug: blogPost.slug,
			title: blogPost.title,
			renderedHtml: blogPost.renderedHtml,
			publishedAt: blogPost.publishedAt
		})
		.from(blogPost)
		.where(eq(blogPost.userId, author.userId))
		.orderBy(desc(blogPost.publishedAt));

	const origin = url.origin;
	const blogUrl = `${origin}/@${author.handle}`;
	const title = escapeXml(`${author.displayName ?? '@' + author.handle} — Blog`);

	const items = posts
		.map((post) => {
			const link = `${blogUrl}/${post.slug}`;
			const description = post.renderedHtml
				.replace(/<[^>]+>/g, ' ')
				.replace(/\s+/g, ' ')
				.trim()
				.slice(0, 300);
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
	<link>${blogUrl}</link>
	<description>${title}</description>${items}
</channel>
</rss>`;

	return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
