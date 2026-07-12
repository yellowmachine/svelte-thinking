import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { eq, desc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { blogPost } from '$lib/server/db/schemas/blog.schema';
import { excerptWithTruncation } from '$lib/server/blogExcerpt';

export const load: PageServerLoad = async ({ params }) => {
	const handle = params.handle.toLowerCase();

	// user_profile_public_read RLS permits this SELECT with no auth context
	const profileRows = await db
		.select({
			userId: userProfile.userId,
			displayName: userProfile.displayName,
			bio: userProfile.bio,
			handle: userProfile.handle
		})
		.from(userProfile)
		.where(eq(userProfile.handle, handle))
		.limit(1);

	if (!profileRows[0]) error(404, 'Este blog no existe');
	const author = profileRows[0];

	const postRows = await db
		.select({
			slug: blogPost.slug,
			title: blogPost.title,
			renderedHtml: blogPost.renderedHtml,
			publishedAt: blogPost.publishedAt
		})
		.from(blogPost)
		.where(eq(blogPost.userId, author.userId))
		.orderBy(desc(blogPost.publishedAt));

	const posts = postRows.map(({ renderedHtml, ...post }) => {
		const { text: excerpt, truncated } = excerptWithTruncation(renderedHtml, 200);
		return { ...post, excerpt, truncated };
	});

	return { author, posts };
};
