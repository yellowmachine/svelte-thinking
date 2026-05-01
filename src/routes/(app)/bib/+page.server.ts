import type { PageServerLoad } from './$types';
import { reference, projectReference } from '$lib/server/db/schemas/references.schema';
import { project } from '$lib/server/db/schemas/projects.schema';
import { eq, asc } from 'drizzle-orm';

export const load: PageServerLoad = async (event) => {
	const references = (await event.locals.withRLS((db) =>
		db
			.select({
				id: reference.id,
				projectId: projectReference.projectId,
				projectTitle: project.title,
				citeKey: reference.citeKey,
				type: reference.type,
				title: reference.title,
				authors: reference.authors,
				editors: reference.editors,
				year: reference.year,
				journal: reference.journal,
				booktitle: reference.booktitle,
				publisher: reference.publisher,
				doi: reference.doi,
				url: reference.url
			})
			.from(reference)
			.leftJoin(projectReference, eq(projectReference.referenceId, reference.id))
			.leftJoin(project, eq(project.id, projectReference.projectId))
			.where(eq(reference.userId, event.locals.user!.id))
			.orderBy(asc(reference.citeKey))
	)) as {
		id: string;
		projectId: string | null;
		projectTitle: string | null;
		citeKey: string;
		type: string;
		title: string;
		authors: { first: string; last: string }[];
		editors: { first: string; last: string }[];
		year: string | null;
		journal: string | null;
		booktitle: string | null;
		publisher: string | null;
		doi: string | null;
		url: string | null;
	}[];

	return { references };
};
