import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { document, documentVersion } from '$lib/server/db/schemas/documents.schema';
import { eq, inArray } from 'drizzle-orm';

const UUID_LINK_RE = /\[\[doc:([a-f0-9-]{36})\|([^\]]+)\]\]/g;

export const load: PageServerLoad = async (event) => {
	const { id: projectId, docId } = event.params;

	// Load book document with its committed content
	const bookDoc = await event.locals.withRLS(async (db) => {
		const docs = await db.select().from(document).where(eq(document.id, docId)).limit(1);
		if (!docs[0] || docs[0].type !== 'book') return null;

		const doc = docs[0];
		if (!doc.currentVersionId) return { ...doc, content: doc.draftContent ?? '' };

		const versions = await db
			.select()
			.from(documentVersion)
			.where(eq(documentVersion.id, doc.currentVersionId))
			.limit(1);

		return { ...doc, content: versions[0]?.content ?? '' };
	});

	if (!bookDoc) error(404, 'Book not found');

	// Strip YAML frontmatter before processing
	const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
	const contentWithoutFrontmatter = bookDoc.content.replace(FRONTMATTER_RE, '').trimStart();

	// Parse chapter references in document order
	const chapterRefs: { uuid: string; title: string; matchIndex: number }[] = [];
	for (const match of contentWithoutFrontmatter.matchAll(UUID_LINK_RE)) {
		chapterRefs.push({ uuid: match[1], title: match[2], matchIndex: match.index ?? 0 });
	}

	// Preamble: content before the first [[doc:...]] reference
	const preamble =
		chapterRefs.length > 0
			? contentWithoutFrontmatter.slice(0, chapterRefs[0].matchIndex).trim()
			: contentWithoutFrontmatter;

	// Load committed content for each referenced chapter
	const chapterIds = chapterRefs.map((r) => r.uuid);
	const chapterContents = await event.locals.withRLS(async (db) => {
		if (chapterIds.length === 0) return [];

		const docs = await db.select().from(document).where(inArray(document.id, chapterIds));

		const withContent = await Promise.all(
			docs.map(async (doc) => {
				if (!doc.currentVersionId) return { id: doc.id, content: '' };
				const versions = await db
					.select({ content: documentVersion.content })
					.from(documentVersion)
					.where(eq(documentVersion.id, doc.currentVersionId))
					.limit(1);
				return { id: doc.id, content: versions[0]?.content ?? '' };
			})
		);

		return withContent;
	});

	const contentById = new Map(chapterContents.map((c) => [c.id, c.content]));

	// Assemble chapters in book order
	const chapters = chapterRefs.map((ref) => ({
		id: ref.uuid,
		title: ref.title,
		content: contentById.get(ref.uuid) ?? ''
	}));

	// Load project docs for wikilink resolution inside chapter content
	const projectDocs = (await event.locals.withRLS((db) =>
		db
			.select({ id: document.id, title: document.title, projectId: document.projectId })
			.from(document)
			.where(eq(document.projectId, projectId))
	)) as { id: string; title: string; projectId: string }[];

	return {
		book: {
			id: bookDoc.id,
			title: bookDoc.title,
			preamble,
			projectId
		},
		chapters,
		projectDocs
	};
};
