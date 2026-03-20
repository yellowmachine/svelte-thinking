import type { PageServerLoad } from './$types';
import { projectReference } from '$lib/server/db/schemas/references.schema';
import { project } from '$lib/server/db/schemas/projects.schema';
import { eq, asc } from 'drizzle-orm';

export const load: PageServerLoad = async (event) => {
	const references = await event.locals.withRLS((db) =>
		db
			.select({
				id: projectReference.id,
				projectId: projectReference.projectId,
				projectTitle: project.title,
				citeKey: projectReference.citeKey,
				type: projectReference.type,
				title: projectReference.title,
				authors: projectReference.authors,
				editors: projectReference.editors,
				year: projectReference.year,
				journal: projectReference.journal,
				booktitle: projectReference.booktitle,
				publisher: projectReference.publisher,
				doi: projectReference.doi,
				url: projectReference.url
			})
			.from(projectReference)
			.innerJoin(project, eq(projectReference.projectId, project.id))
			.orderBy(asc(projectReference.citeKey))
	) as {
		id: string;
		projectId: string;
		projectTitle: string;
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
