import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq, asc } from 'drizzle-orm';
import { project } from '$lib/server/db/schemas/projects.schema';
import { document } from '$lib/server/db/schemas/documents.schema';
import { projectRequirement } from '$lib/server/db/schemas/requirements.schema';
import { projectReference } from '$lib/server/db/schemas/references.schema';
import { buildTypstSource, compileToPdf } from '$lib/server/typst';
import { markdownToTypst } from '$lib/utils/markdownToTypst';
import type { RefData } from '$lib/utils/export';

export const GET: RequestHandler = async (event) => {
	const projectId = event.params.id;

	// Load project + fulfilled requirements in order + their documents
	const [proj, requirements, rawRefs] = await Promise.all([
		event.locals.withRLS((db) =>
			db
				.select({ id: project.id, title: project.title, description: project.description })
				.from(project)
				.where(eq(project.id, projectId))
				.limit(1)
		) as Promise<{ id: string; title: string; description: string | null }[]>,

		event.locals.withRLS((db) =>
			db
				.select({
					name: projectRequirement.name,
					order: projectRequirement.order,
					fulfilledDocumentId: projectRequirement.fulfilledDocumentId
				})
				.from(projectRequirement)
				.where(eq(projectRequirement.projectId, projectId))
				.orderBy(asc(projectRequirement.order))
		) as Promise<{ name: string; order: number; fulfilledDocumentId: string | null }[]>,

		event.locals.withRLS((db) =>
			db.select().from(projectReference).where(eq(projectReference.projectId, projectId))
		) as Promise<(typeof projectReference.$inferSelect)[]>
	]);

	if (!proj[0]) error(404, 'Proyecto no encontrado');

	const fulfilledReqs = requirements.filter((r) => r.fulfilledDocumentId !== null);

	if (fulfilledReqs.length === 0) {
		error(422, 'El proyecto no tiene requisitos completados para exportar');
	}

	// Load document contents in one query
	const docIds = fulfilledReqs.map((r) => r.fulfilledDocumentId!);
	const docs = await event.locals.withRLS((db) =>
		db
			.select({ id: document.id, title: document.title, draftContent: document.draftContent })
			.from(document)
			.where(eq(document.projectId, projectId))
	) as { id: string; title: string; draftContent: string | null }[];

	const docMap = new Map(docs.map((d) => [d.id, d]));

	// Build sections in requirement order, skip missing docs
	const sections = fulfilledReqs.flatMap((req) => {
		const doc = docMap.get(req.fulfilledDocumentId!);
		if (!doc || !doc.draftContent?.trim()) return [];
		return [{ title: req.name, content: markdownToTypst(doc.draftContent) }];
	});

	if (sections.length === 0) {
		error(422, 'Los documentos asignados no tienen contenido todavía');
	}

	const refs: RefData[] = rawRefs.map((r) => ({
		citeKey: r.citeKey,
		type: r.type,
		title: r.title,
		authors: r.authors as RefData['authors'],
		editors: (r.editors ?? []) as RefData['editors'],
		year: r.year,
		journal: r.journal,
		volume: r.volume,
		issue: r.issue,
		pages: r.pages,
		publisher: r.publisher,
		booktitle: r.booktitle,
		school: r.school,
		institution: r.institution,
		doi: r.doi,
		url: r.url,
		note: r.note
	}));

	let pdf: Uint8Array;
	try {
		const typstSource = buildTypstSource({
			title: proj[0].title,
			description: proj[0].description,
			sections,
			refs
		});
		pdf = await compileToPdf(typstSource);
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'Error al generar el PDF';
		error(500, msg);
	}

	const filename = `${proj[0].title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`;

	return new Response(pdf.buffer as ArrayBuffer, {
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
};
