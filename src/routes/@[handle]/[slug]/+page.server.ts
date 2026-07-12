import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { eq, and } from 'drizzle-orm';
import { parseHTML } from 'linkedom';
import { db } from '$lib/server/db';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { blogPost } from '$lib/server/db/schemas/blog.schema';

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

	// Parse (not regex-strip) so HTML entities like &#039; come out decoded —
	// stripping tags with regex leaves entities in place, and Svelte's
	// attribute auto-escaping then double-encodes them (&amp;#039;) in the
	// rendered <meta> tag.
	const { document: dom } = parseHTML(
		`<!DOCTYPE html><html><body>${post.renderedHtml}</body></html>`
	);
	const description =
		(dom.body.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 160) ||
		`${post.title} — publicado por @${author.handle} en Scholio.`;

	return { author, post, description };
};
