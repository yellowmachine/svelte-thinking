import type { PageServerLoad } from './$types';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { document, documentVersion } from '$lib/server/db/schemas/documents.schema';
import { blogPost } from '$lib/server/db/schemas/blog.schema';
import { eq, and, gte, lt, desc, count, sql } from 'drizzle-orm';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export const load: PageServerLoad = async (event) => {
	const userId = event.locals.user!.id;
	const monthParam = event.url.searchParams.get('month');

	// Bucketed by calendar month so the sidebar can act as an archive/pagination
	// index without ever scanning the full table for the count.
	const monthExpr = sql<string>`to_char(date_trunc('month', ${blogPost.publishedAt}), 'YYYY-MM')`;

	const { handle, months, selectedMonth, posts } = await event.locals.withRLS(async (db) => {
		const [profileRows, monthBuckets] = await Promise.all([
			db
				.select({ handle: userProfile.handle })
				.from(userProfile)
				.where(eq(userProfile.userId, userId))
				.limit(1),
			db
				.select({ month: monthExpr, count: count() })
				.from(blogPost)
				.where(eq(blogPost.userId, userId))
				.groupBy(monthExpr)
				.orderBy(desc(monthExpr))
		]);

		const selectedMonth =
			monthParam && MONTH_RE.test(monthParam)
				? monthParam
				: (monthBuckets[0]?.month ?? new Date().toISOString().slice(0, 7));

		const [year, month] = selectedMonth.split('-').map(Number);
		const rangeStart = new Date(Date.UTC(year, month - 1, 1));
		const rangeEnd = new Date(Date.UTC(year, month, 1));

		// Range scan on the existing (userId, publishedAt) index — bounded to one
		// month's rows regardless of how many posts the user has published in total.
		const posts = await db
			.select({
				id: blogPost.id,
				documentId: blogPost.documentId,
				projectId: document.projectId,
				versionNumber: documentVersion.versionNumber,
				slug: blogPost.slug,
				title: blogPost.title,
				publishedAt: blogPost.publishedAt,
				commentsEnabled: blogPost.commentsEnabled,
				commentsVisible: blogPost.commentsVisible,
				pendingCommentCount: sql<number>`(
					SELECT count(*) FROM scholio.blog_post_comment
					WHERE blog_post_comment.blog_post_id = ${blogPost.id}
					AND blog_post_comment.status = 'pending'
				)`
			})
			.from(blogPost)
			.innerJoin(document, eq(document.id, blogPost.documentId))
			.innerJoin(documentVersion, eq(documentVersion.id, blogPost.versionId))
			.where(
				and(
					eq(blogPost.userId, userId),
					gte(blogPost.publishedAt, rangeStart),
					lt(blogPost.publishedAt, rangeEnd)
				)
			)
			.orderBy(desc(blogPost.publishedAt));

		return {
			handle: profileRows[0]?.handle ?? null,
			months: monthBuckets,
			selectedMonth,
			posts
		};
	});

	return { handle, months, selectedMonth, posts };
};
