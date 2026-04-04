import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { eq, desc } from 'drizzle-orm';
import { document, documentVersion } from '$lib/server/db/schemas/documents.schema';
import { project } from '$lib/server/db/schemas/projects.schema';

export const load: PageServerLoad = async (event) => {
	const { id: projectId, docId } = event.params;

	const [docRows, projectRows, versions] = await Promise.all([
		event.locals.withRLS((db) =>
			db
				.select({ id: document.id, title: document.title, projectId: document.projectId, writerUserId: document.writerUserId })
				.from(document)
				.where(eq(document.id, docId))
				.limit(1)
		),
		event.locals.withRLS((db) =>
			db
				.select({ title: project.title, ownerId: project.ownerId })
				.from(project)
				.where(eq(project.id, projectId))
				.limit(1)
		),
		event.locals.withRLS((db) =>
			db
				.select({
					id: documentVersion.id,
					versionNumber: documentVersion.versionNumber,
					changeDescription: documentVersion.changeDescription,
					createdBy: documentVersion.createdBy,
					createdAt: documentVersion.createdAt
				})
				.from(documentVersion)
				.where(eq(documentVersion.documentId, docId))
				.orderBy(desc(documentVersion.versionNumber))
		)
	]);

	if (!docRows[0]) error(404, 'Documento no encontrado');

	const proj = projectRows[0];
	const currentUserId = event.locals.user!.id;
	const ownerId = proj?.ownerId ?? '';
	const doc = docRows[0];
	const canWrite = doc.writerUserId === null
		? currentUserId === ownerId
		: currentUserId === doc.writerUserId;

	return {
		document: doc,
		projectTitle: proj?.title ?? '',
		projectOwnerId: ownerId,
		versions,
		canWrite,
		currentUserId
	};
};
