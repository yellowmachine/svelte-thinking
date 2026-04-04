import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { unzipSync } from 'fflate';
import { parse } from 'yaml';
import { db } from '$lib/server/db';
import { project } from '$lib/server/db/schemas/projects.schema';
import { document, documentVersion } from '$lib/server/db/schemas/documents.schema';
import { projectReference } from '$lib/server/db/schemas/references.schema';

const MAX_SIZE = 200 * 1024 * 1024; // 200 MB

const VALID_DOC_TYPES = new Set([
	'paper', 'notes', 'outline', 'bibliography',
	'supplementary', 'book', 'chapter', 'reading_note'
]);

const VALID_PROJECT_STATUSES = new Set([
	'draft', 'active', 'review', 'published', 'archived'
]);

const VALID_REF_TYPES = new Set([
	'article', 'book', 'inproceedings', 'incollection', 'phdthesis',
	'mastersthesis', 'techreport', 'misc', 'magisterial', 'patristic',
	'scholastic', 'biblical', 'classical', 'earlymodern'
]);

export const POST: RequestHandler = async (event) => {
	const user = event.locals.user;
	if (!user) error(401, 'No autenticado');

	const contentLength = Number(event.request.headers.get('content-length') ?? 0);
	if (contentLength > MAX_SIZE) error(413, 'El archivo es demasiado grande (máx. 200 MB)');

	const formData = await event.request.formData();
	const file = formData.get('file');
	if (!(file instanceof File)) error(400, 'Se esperaba un campo "file"');
	if (!file.name.endsWith('.zip')) error(400, 'El archivo debe ser un ZIP');

	const buffer = new Uint8Array(await file.arrayBuffer());
	if (buffer.byteLength > MAX_SIZE) error(413, 'El archivo es demasiado grande (máx. 200 MB)');

	// ── Decompress ──────────────────────────────────────────────────────────────
	let zip: ReturnType<typeof unzipSync>;
	try {
		zip = unzipSync(buffer);
	} catch {
		error(400, 'No se pudo leer el ZIP');
	}

	const yamlEntry = zip['project.yaml'];
	if (!yamlEntry) error(400, 'El ZIP no contiene project.yaml');

	// ── Parse & validate YAML ───────────────────────────────────────────────────
	let data: Record<string, unknown>;
	try {
		data = parse(new TextDecoder().decode(yamlEntry));
	} catch {
		error(400, 'project.yaml no es un YAML válido');
	}

	if (!data?.scholio_export) error(400, 'No es un export válido de Scholio');

	const proj = data.project as Record<string, unknown> | undefined;
	if (!proj?.title || typeof proj.title !== 'string') {
		error(400, 'project.title es obligatorio');
	}

	const rawDocs = (data.documents as unknown[]) ?? [];
	const rawRefs = (data.references as unknown[]) ?? [];

	// ── Build in a single transaction ───────────────────────────────────────────
	const projectId = crypto.randomUUID();

	const newProjectId = await db.transaction(async (tx) => {
		// 1. Project
		await tx.insert(project).values({
			id: projectId,
			title: proj.title as string,
			description: typeof proj.description === 'string' ? proj.description : null,
			status: VALID_PROJECT_STATUSES.has(proj.status as string)
				? (proj.status as 'draft' | 'active' | 'review' | 'published' | 'archived')
				: 'draft',
			ownerId: user.id
		});

		// 2. References
		if (rawRefs.length > 0) {
			await tx.insert(projectReference).values(
				rawRefs
					.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
					.map((r) => ({
						id: crypto.randomUUID(),
						projectId,
						citeKey: String(r.cite_key ?? crypto.randomUUID()),
						type: VALID_REF_TYPES.has(r.type as string)
							? (r.type as typeof projectReference.$inferInsert['type'])
							: 'misc',
						title: String(r.title ?? 'Sin título'),
						authors: Array.isArray(r.authors) ? r.authors : [],
						editors: Array.isArray(r.editors) ? r.editors : [],
						year: typeof r.year === 'string' ? r.year : null,
						abstract: typeof r.abstract === 'string' ? r.abstract : null,
						doi: typeof r.doi === 'string' ? r.doi : null,
						url: typeof r.url === 'string' ? r.url : null,
						journal: typeof r.journal === 'string' ? r.journal : null,
						volume: typeof r.volume === 'string' ? r.volume : null,
						issue: typeof r.issue === 'string' ? r.issue : null,
						pages: typeof r.pages === 'string' ? r.pages : null,
						publisher: typeof r.publisher === 'string' ? r.publisher : null,
						booktitle: typeof r.booktitle === 'string' ? r.booktitle : null,
						school: typeof r.school === 'string' ? r.school : null,
						institution: typeof r.institution === 'string' ? r.institution : null,
						note: typeof r.note === 'string' ? r.note : null
					}))
			);
		}

		// 3. Documents + versions
		for (const raw of rawDocs) {
			const r = raw as Record<string, unknown>;
			if (!r || typeof r !== 'object') continue;

			const docId = crypto.randomUUID();
			const rawVersions = Array.isArray(r.versions) ? r.versions as Record<string, unknown>[] : [];

			// Create versions first so we can set currentVersionId
			const versionRows = rawVersions.map((v, i) => ({
				id: crypto.randomUUID(),
				documentId: docId,
				content: typeof v.content === 'string' ? v.content : '',
				versionNumber: typeof v.version === 'number' ? v.version : i + 1,
				changeDescription: typeof v.message === 'string' && v.message ? v.message : null,
				createdBy: user.id
			}));

			// If no versions in export, synthesize one from current content
			if (versionRows.length === 0) {
				const content = typeof r.content === 'string' ? r.content : '';
				if (content) {
					versionRows.push({
						id: crypto.randomUUID(),
						documentId: docId,
						content,
						versionNumber: 1,
						changeDescription: 'Importado',
						createdBy: user.id
					});
				}
			}

			const lastVersion = versionRows.at(-1);

			await tx.insert(document).values({
				id: docId,
				projectId,
				title: typeof r.title === 'string' ? r.title : 'Sin título',
				type: VALID_DOC_TYPES.has(r.type as string)
					? (r.type as typeof document.$inferInsert['type'])
					: 'notes',
				isPublic: r.is_public === true,
				isPrivate: false,
				ownerUserId: user.id,
				draftContent: null,
				currentVersionId: lastVersion?.id ?? null
			});

			if (versionRows.length > 0) {
				await tx.insert(documentVersion).values(versionRows);
			}
		}

		return projectId;
	});

	return json({ projectId: newProjectId }, { status: 201 });
};
