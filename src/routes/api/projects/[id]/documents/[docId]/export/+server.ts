import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { document, documentVersion } from '$lib/server/db/schemas/documents.schema';
import { reference, projectReference } from '$lib/server/db/schemas/references.schema';
import { toLatex, toTypst, serializeBib, type RefData } from '$lib/utils/export';
import { compileToPdf } from '$lib/server/typst';

export const GET: RequestHandler = async (event) => {
	if (!event.locals.user) error(401, 'No autenticado');

	const { docId, id: projectId } = event.params;
	const format = event.url.searchParams.get('format');
	const versionId = event.url.searchParams.get('versionId');

	if (format !== 'latex' && format !== 'typst' && format !== 'pdf') {
		error(400, 'El parámetro format debe ser latex, typst o pdf');
	}

	// Load document content (specific version > draft > current version)
	const docResult = (await event.locals.withRLS(async (db) => {
		const docs = await db.select().from(document).where(eq(document.id, docId)).limit(1);
		if (!docs[0]) return null;
		const doc = docs[0];

		if (versionId) {
			const versions = await db
				.select({ content: documentVersion.content })
				.from(documentVersion)
				.where(eq(documentVersion.id, versionId))
				.limit(1);
			return { title: doc.title, content: versions[0]?.content ?? '' };
		}

		if (doc.draftContent !== null) {
			return { title: doc.title, content: doc.draftContent };
		}
		if (!doc.currentVersionId) {
			return { title: doc.title, content: '' };
		}

		const versions = await db
			.select({ content: documentVersion.content })
			.from(documentVersion)
			.where(eq(documentVersion.id, doc.currentVersionId))
			.limit(1);

		return { title: doc.title, content: versions[0]?.content ?? '' };
	})) as { title: string; content: string } | null;

	if (!docResult) error(404, 'Documento no encontrado');

	// Load project references for bibliography
	const refs = (await event.locals
		.withRLS((db) =>
			db
				.select({ ref: reference })
				.from(reference)
				.innerJoin(projectReference, eq(projectReference.referenceId, reference.id))
				.where(eq(projectReference.projectId, projectId))
		)
		.then((rows) =>
			(rows as { ref: typeof reference.$inferSelect }[]).map((r) => r.ref)
		)) as unknown as RefData[];

	const slug = docResult.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();

	if (format === 'latex') {
		const tex = toLatex(docResult.content, docResult.title, refs);
		return new Response(tex, {
			headers: {
				'Content-Type': 'application/x-latex; charset=utf-8',
				'Content-Disposition': `attachment; filename="${slug}.tex"`
			}
		});
	} else if (format === 'typst') {
		const typ = toTypst(docResult.content, docResult.title, refs);
		return new Response(typ, {
			headers: {
				'Content-Type': 'text/plain; charset=utf-8',
				'Content-Disposition': `attachment; filename="${slug}.typ"`
			}
		});
	} else {
		const typ = toTypst(docResult.content, docResult.title, refs);
		const bib = serializeBib(refs);
		const files = bib ? { 'refs.bib': bib } : undefined;
		let pdf: Uint8Array;
		try {
			pdf = await compileToPdf(typ, undefined, files);
		} catch (e) {
			error(500, `Error compilando PDF: ${e instanceof Error ? e.message : e}`);
		}
		return new Response(pdf.buffer as ArrayBuffer, {
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': `attachment; filename="${slug}.pdf"`
			}
		});
	}
};
