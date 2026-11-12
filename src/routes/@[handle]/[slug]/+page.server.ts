import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { blogPost, blogPostComment } from '$lib/server/db/schemas/blog.schema';
import { excerptFromHtml } from '$lib/server/blogExcerpt';

export const load: PageServerLoad = async ({ params, locals }) => {
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
	if (!profileRows[0]) error(404, 'This blog does not exist');
	const author = profileRows[0];

	const postRows = await db
		.select({
			id: blogPost.id,
			title: blogPost.title,
			renderedHtml: blogPost.renderedHtml,
			slug: blogPost.slug,
			publishedAt: blogPost.publishedAt,
			commentsEnabled: blogPost.commentsEnabled,
			commentsVisible: blogPost.commentsVisible
		})
		.from(blogPost)
		.where(and(eq(blogPost.userId, author.userId), eq(blogPost.slug, params.slug)))
		.limit(1);
	if (!postRows[0]) error(404, 'This post does not exist');
	const post = postRows[0];

	const description =
		excerptFromHtml(post.renderedHtml, 160) ||
		`${post.title} — published by @${author.handle} on Scholio.`;

	// Plain db, no user: RLS still applies, and only blog_post_comment_public_read
	// lets rows through (approved comments on posts with comments visible). The
	// WHERE below repeats that predicate; it does not widen what RLS allows.
	const comments = post.commentsVisible
		? await db
				.select({
					id: blogPostComment.id,
					authorId: blogPostComment.authorId,
					authorName: sql<string>`(SELECT name FROM "user" WHERE "user".id = ${blogPostComment.authorId})`,
					content: blogPostComment.content,
					createdAt: blogPostComment.createdAt
				})
				.from(blogPostComment)
				.where(and(eq(blogPostComment.blogPostId, post.id), eq(blogPostComment.status, 'approved')))
				.orderBy(desc(blogPostComment.createdAt))
		: [];

	return { author, post, description, comments, currentUserId: locals.user?.id ?? null };
};
