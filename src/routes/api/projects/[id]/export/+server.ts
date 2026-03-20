import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { stringify } from 'yaml';
import { eq, desc, asc } from 'drizzle-orm';
import { project, projectCollaborator } from '$lib/server/db/schemas/projects.schema';
import { document, documentVersion } from '$lib/server/db/schemas/documents.schema';
import { projectReference } from '$lib/server/db/schemas/references.schema';

export const GET: RequestHandler = async (event) => {
	const projectId = event.params.id;

	const [proj, documents, collaborators, references] = await Promise.all([
		event.locals.withRLS((db) =>
			db.select().from(project).where(eq(project.id, projectId)).limit(1)
		),
		event.locals.withRLS((db) =>
			db.select().from(document).where(eq(document.projectId, projectId)).orderBy(asc(document.createdAt))
		),
		event.locals.withRLS((db) =>
			db.select().from(projectCollaborator).where(eq(projectCollaborator.projectId, projectId))
		),
		event.locals.withRLS((db) =>
			db.select().from(projectReference).where(eq(projectReference.projectId, projectId)).orderBy(asc(projectReference.citeKey))
		)
	]);

	if (!proj[0]) error(404, 'Proyecto no encontrado');

	// For each document, fetch all committed versions
	const documentsWithVersions = await Promise.all(
		documents.map(async (doc) => {
			const versions = await event.locals.withRLS((db) =>
				db
					.select({
						versionNumber: documentVersion.versionNumber,
						changeDescription: documentVersion.changeDescription,
						createdAt: documentVersion.createdAt,
						content: documentVersion.content
					})
					.from(documentVersion)
					.where(eq(documentVersion.documentId, doc.id))
					.orderBy(asc(documentVersion.versionNumber))
			);

			return {
				title: doc.title,
				type: doc.type,
				is_public: doc.isPublic,
				created_at: doc.createdAt.toISOString(),
				updated_at: doc.updatedAt.toISOString(),
				// Current content: draft if exists, otherwise latest committed version
				content: doc.draftContent ?? versions.at(-1)?.content ?? '',
				...(doc.draftContent !== null ? { has_unpublished_draft: true } : {}),
				versions: versions.map((v) => ({
					version: v.versionNumber,
					message: v.changeDescription ?? '',
					date: v.createdAt.toISOString(),
					content: v.content
				}))
			};
		})
	);

	const exportData = {
		scholio_export: {
			version: '1.0',
			exported_at: new Date().toISOString(),
			source: 'scholio.app'
		},
		project: {
			title: proj[0].title,
			description: proj[0].description ?? null,
			status: proj[0].status,
			created_at: proj[0].createdAt.toISOString()
		},
		collaborators: collaborators.map((c) => ({
			role: c.role,
			joined_at: c.createdAt.toISOString()
		})),
		documents: documentsWithVersions,
		references: references.map((r) => ({
			cite_key: r.citeKey,
			type: r.type,
			title: r.title,
			authors: r.authors,
			year: r.year ?? null,
			abstract: r.abstract ?? null,
			doi: r.doi ?? null,
			url: r.url ?? null,
			journal: r.journal ?? null,
			volume: r.volume ?? null,
			issue: r.issue ?? null,
			pages: r.pages ?? null,
			publisher: r.publisher ?? null,
			booktitle: r.booktitle ?? null,
			school: r.school ?? null,
			institution: r.institution ?? null,
			note: r.note ?? null,
			reading_notes: r.readingNotes ?? null
		})).map((r) => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null)))
	};

	const yaml = stringify(exportData, { lineWidth: 0 });
	const filename = `${proj[0].title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-export.yaml`;

	return new Response(yaml, {
		headers: {
			'Content-Type': 'text/yaml; charset=utf-8',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
};
