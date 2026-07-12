import type { RequestHandler } from './$types';
import { eq, isNotNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { blogPost } from '$lib/server/db/schemas/blog.schema';

export const GET: RequestHandler = async ({ url }) => {
	const rows = await db
		.select({
			handle: userProfile.handle,
			slug: blogPost.slug,
			publishedAt: blogPost.publishedAt
		})
		.from(blogPost)
		.innerJoin(userProfile, eq(userProfile.userId, blogPost.userId))
		.where(isNotNull(userProfile.handle));

	const origin = url.origin;
	const urls = rows
		.map(
			(r) => `
	<url>
		<loc>${origin}/@${r.handle}/${r.slug}</loc>
		<lastmod>${new Date(r.publishedAt).toISOString()}</lastmod>
	</url>`
		)
		.join('');

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>`;

	return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
