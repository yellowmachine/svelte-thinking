import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq, and } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { blogPost } from '$lib/server/db/schemas/blog.schema';
import { serializeBib, type RefData } from '$lib/utils/export';
import { markdownToTypst } from '$lib/utils/markdownToTypst';
import { compileToPdf } from '$lib/server/typst';

// Wraps markdownToTypst's body conversion in a minimal title+content document —
// same preamble style as the simple single-document export (toTypst in
// $lib/utils/export.ts), but using the richer converter so epigraphs, callouts,
// footnotes, and [[person:Name]] wikilinks/index render correctly instead of
// leaking as raw text (markdownToTypst supports these; the simpler mdToTypst
// used by the app's existing "Export" button does not).
function buildPostTypst(title: string, content: string, hasRefs: boolean): string {
	const body = markdownToTypst(content);
	const bibSection = hasRefs ? '\n#bibliography("refs.bib")\n' : '';
	const escapedTitle = title.replace(/"/g, '\\"');

	return `#set document(title: "${escapedTitle}")
#set page(paper: "a4", margin: (x: 2.5cm, y: 3cm))
#set text(font: "New Computer Modern", size: 11pt)
#set par(justify: true)

#align(center)[
  #text(size: 16pt, weight: "bold")[${escapedTitle}]
  #v(0.5em)
]

#v(1em)

${body.trim()}
${bibSection}`;
}

// Public PDF download for a published blog post, sourced entirely from the
// blogPost snapshot (content/refsJson) so it never needs to touch
// RLS-protected document/documentVersion/reference tables.
export const GET: RequestHandler = async ({ params }) => {
	const handle = params.handle.toLowerCase();

	const profileRows = await db
		.select({ userId: userProfile.userId })
		.from(userProfile)
		.where(eq(userProfile.handle, handle))
		.limit(1);
	if (!profileRows[0]) error(404, 'Este blog no existe');

	const postRows = await db
		.select({ title: blogPost.title, content: blogPost.content, refsJson: blogPost.refsJson })
		.from(blogPost)
		.where(and(eq(blogPost.userId, profileRows[0].userId), eq(blogPost.slug, params.slug)))
		.limit(1);
	if (!postRows[0]) error(404, 'Esta publicación no existe');
	const post = postRows[0];

	const refs: RefData[] = post.refsJson ? JSON.parse(post.refsJson) : [];
	const typ = buildPostTypst(post.title, post.content, refs.length > 0);
	const bib = serializeBib(refs);
	const files = bib.trim() ? { 'refs.bib': bib } : undefined;

	let pdf: Uint8Array;
	try {
		pdf = await compileToPdf(typ, undefined, files);
	} catch (e) {
		error(500, `Error compilando PDF: ${e instanceof Error ? e.message : e}`);
	}

	const slug = params.slug;
	return new Response(pdf.buffer as ArrayBuffer, {
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `attachment; filename="${slug}.pdf"`
		}
	});
};
