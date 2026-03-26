import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq, inArray } from 'drizzle-orm';
import { parse as parseYaml } from 'yaml';
import { document, documentVersion } from '$lib/server/db/schemas/documents.schema';
import { projectCollaborator } from '$lib/server/db/schemas/projects.schema';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { user as authUser } from '$lib/server/db/auth.schema';
import { buildTypstSource, compileToPdf } from '$lib/server/typst';
import { markdownToTypst } from '$lib/utils/markdownToTypst';

const UUID_LINK_RE = /\[\[doc:([a-f0-9-]{36})\|([^\]]+)\]\]/g;
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export const GET: RequestHandler = async (event) => {
	if (!event.locals.user) error(401, 'Unauthorized');

	const { docId, id: projectId } = event.params;

	// Load book document with committed content
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
	}) as { title: string; content: string } | null;

	if (!bookDoc) error(404, 'Book not found');

	// Parse and strip YAML frontmatter
	const frontmatterMatch = bookDoc.content.match(FRONTMATTER_RE);
	let subtitle: string | undefined;
	let edition: string | undefined;

	if (frontmatterMatch) {
		try {
			const fm = parseYaml(frontmatterMatch[1]) as Record<string, unknown>;
			if (typeof fm.subtitle === 'string' && fm.subtitle.trim()) subtitle = fm.subtitle.trim();
			if (typeof fm.edition === 'string' && fm.edition.trim()) edition = fm.edition.trim();
		} catch {
			// Ignore malformed frontmatter
		}
	}

	const contentWithoutFrontmatter = bookDoc.content.replace(FRONTMATTER_RE, '').trimStart();

	// Parse chapter references in document order
	const chapterRefs: { uuid: string; title: string }[] = [];
	for (const match of contentWithoutFrontmatter.matchAll(UUID_LINK_RE)) {
		chapterRefs.push({ uuid: match[1], title: match[2] });
	}

	// Preamble: content before the first chapter reference
	const firstMatchIdx = contentWithoutFrontmatter.search(UUID_LINK_RE);
	const preamble = firstMatchIdx > 0 ? contentWithoutFrontmatter.slice(0, firstMatchIdx).trim() : '';

	// Load committed content for each referenced chapter
	const chapterIds = chapterRefs.map((r) => r.uuid);
	const chapterContents = await event.locals.withRLS(async (db) => {
		if (chapterIds.length === 0) return new Map<string, string>();

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

		return new Map(withContent.map((c) => [c.id, c.content]));
	}) as Map<string, string>;

	// Load project collaborators for author list
	const collaborators = await event.locals.withRLS((db) =>
		db
			.select({ userId: projectCollaborator.userId, role: projectCollaborator.role })
			.from(projectCollaborator)
			.where(eq(projectCollaborator.projectId, projectId))
	) as { userId: string; role: string }[];

	const authorRoles = ['owner', 'author', 'coauthor'];
	const authorCollabs = collaborators.filter((c) => authorRoles.includes(c.role));
	const authorUserIds = authorCollabs.map((c) => c.userId);

	const authorNames: string[] = [];
	if (authorUserIds.length > 0) {
		const profiles = await event.locals.withRLS((db) =>
			db
				.select({ userId: userProfile.userId, displayName: userProfile.displayName })
				.from(userProfile)
				.where(inArray(userProfile.userId, authorUserIds))
		) as { userId: string; displayName: string | null }[];

		const missingIds = authorUserIds.filter((id) => !profiles.find((p) => p.userId === id));
		const authNames = missingIds.length > 0
			? await event.locals.withRLS((db) =>
				db
					.select({ id: authUser.id, name: authUser.name })
					.from(authUser)
					.where(inArray(authUser.id, missingIds))
			) as { id: string; name: string }[]
			: [];

		const nameMap = new Map<string, string>();
		for (const p of profiles) if (p.displayName) nameMap.set(p.userId, p.displayName);
		for (const u of authNames) nameMap.set(u.id, u.name);

		for (const role of authorRoles) {
			for (const c of authorCollabs.filter((x) => x.role === role)) {
				const name = nameMap.get(c.userId);
				if (name) authorNames.push(name);
			}
		}
	}

	// Convert content to Typst sections
	const imageRegistry = new Map<string, string>();

	const sections = [];

	if (preamble) {
		sections.push({ title: 'Introduction', content: markdownToTypst(preamble, imageRegistry) });
	}

	for (const ref of chapterRefs) {
		const content = chapterContents.get(ref.uuid) ?? '';
		sections.push({ title: ref.title, content: markdownToTypst(content, imageRegistry) });
	}

	if (sections.length === 0) {
		error(422, 'This book has no content to export yet');
	}

	// Compile to PDF
	let pdf: Uint8Array;
	try {
		const typstSource = buildTypstSource({
			title: bookDoc.title,
			subtitle,
			edition,
			authors: authorNames,
			sections,
			template: 'book'
		});
		const images = imageRegistry.size > 0 ? Object.fromEntries(imageRegistry) : undefined;
		pdf = await compileToPdf(typstSource, images);
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'Error generating PDF';
		error(500, msg);
	}

	const filename = `${bookDoc.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`;

	return new Response(pdf.buffer as ArrayBuffer, {
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
};
