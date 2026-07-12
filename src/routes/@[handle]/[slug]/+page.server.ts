import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { eq, and } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { blogPost } from '$lib/server/db/schemas/blog.schema';
import { excerptFromHtml } from '$lib/server/blogExcerpt';

export const load: PageServerLoad = async ({ params }) => {
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

	const postRows = await db
		.select({
			id: blogPost.id,
			title: blogPost.title,
			renderedHtml: blogPost.renderedHtml,
			slug: blogPost.slug,
			publishedAt: blogPost.publishedAt
		})
		.from(blogPost)
		.where(and(eq(blogPost.userId, author.userId), eq(blogPost.slug, params.slug)))
		.limit(1);
	if (!postRows[0]) error(404, 'Esta publicación no existe');
	const post = postRows[0];

	const description =
		excerptFromHtml(post.renderedHtml, 160) ||
		`${post.title} — publicado por @${author.handle} en Scholio.`;

	return { author, post, description };
};
