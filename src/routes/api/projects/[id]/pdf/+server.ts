import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq, asc, inArray } from 'drizzle-orm';
import { project, projectCollaborator } from '$lib/server/db/schemas/projects.schema';
import { document } from '$lib/server/db/schemas/documents.schema';
import { projectRequirement } from '$lib/server/db/schemas/requirements.schema';
import { projectReference } from '$lib/server/db/schemas/references.schema';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { user as authUser } from '$lib/server/db/auth.schema';
import { buildTypstSource, compileToPdf } from '$lib/server/typst';
import { markdownToTypst } from '$lib/utils/markdownToTypst';
import type { RefData } from '$lib/utils/export';
import type { TemplateType } from '$lib/server/trpc/routers/requirements';

export const GET: RequestHandler = async (event) => {
	const projectId = event.params.id;

	// Load project + fulfilled requirements in order + their documents + collaborators
	const [proj, requirements, rawRefs, collaborators] = await Promise.all([
		event.locals.withRLS((db) =>
			db
				.select({
					id: project.id,
					title: project.title,
					description: project.description,
					requirementsTemplate: project.requirementsTemplate,
					doi: project.doi,
					version: project.version,
					publishedAt: project.publishedAt
				})
				.from(project)
				.where(eq(project.id, projectId))
				.limit(1)
		) as Promise<{ id: string; title: string; description: string | null; requirementsTemplate: string | null; doi: string | null; version: string | null; publishedAt: Date | null }[]>,

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
		) as Promise<(typeof projectReference.$inferSelect)[]>,

		event.locals.withRLS((db) =>
			db
				.select({ userId: projectCollaborator.userId, role: projectCollaborator.role })
				.from(projectCollaborator)
				.where(
					eq(projectCollaborator.projectId, projectId)
				)
		) as Promise<{ userId: string; role: string }[]>
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
	// imageRegistry collects localName → minioUrl for all images found across sections
	const imageRegistry = new Map<string, string>();
	const sections = fulfilledReqs.flatMap((req) => {
		const doc = docMap.get(req.fulfilledDocumentId!);
		if (!doc || !doc.draftContent?.trim()) return [];
		return [{ title: req.name, content: markdownToTypst(doc.draftContent, imageRegistry) }];
	});

	if (sections.length === 0) {
		error(422, 'Los documentos asignados no tienen contenido todavía');
	}

	// Resolve author names: join collaborators with userProfile (displayName) or auth user (name)
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

		// For any userId without a profile, fall back to auth user name
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

		// Preserve order: owner first, then authors, then coauthors
		for (const role of authorRoles) {
			for (const c of authorCollabs.filter((x) => x.role === role)) {
				const name = nameMap.get(c.userId);
				if (name) authorNames.push(name);
			}
		}
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
		const p = proj[0];
		const date = p.publishedAt
			? p.publishedAt.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })
			: undefined;

		const typstSource = buildTypstSource({
			title: p.title,
			description: p.description,
			date,
			authors: authorNames,
			doi: p.doi ?? undefined,
			version: p.version ?? undefined,
			sections,
			refs,
			template: (p.requirementsTemplate as TemplateType) ?? 'generic'
		});
		const images = imageRegistry.size > 0 ? Object.fromEntries(imageRegistry) : undefined;
		pdf = await compileToPdf(typstSource, images);
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
