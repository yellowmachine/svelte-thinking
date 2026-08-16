import { error } from '@sveltejs/kit';
import type { RequestHandler, RequestEvent } from './$types';
import { eq, inArray } from 'drizzle-orm';
import { document, documentVersion } from '$lib/server/db/schemas/documents.schema';
import { reference, projectReference } from '$lib/server/db/schemas/references.schema';
import {
	toLatex,
	toTypst,
	serializeBib,
	type RefData,
	type DiagramSvgMap
} from '$lib/utils/export';
import { compileToPdf } from '$lib/server/typst';
import { DIAGRAM_LINK_RE } from '$lib/utils/wikilinks';
import { renderMermaidToSvgServer } from '$lib/server/kroki';

/**
 * Resolves [[diagram:uuid|Title]] tokens referenced in `content` to rendered
 * SVGs, for embedding real diagrams in the PDF export. A diagram that no
 * longer exists, or that fails to render, is simply left out of the map —
 * `toTypst` falls back to its text placeholder for anything missing here.
 */
async function resolveDiagramSvgs(event: RequestEvent, content: string): Promise<DiagramSvgMap> {
	const ids = [...new Set([...content.matchAll(DIAGRAM_LINK_RE)].map((m) => m[1]))];
	if (ids.length === 0) return new Map();

	const rows = (await event.locals.withRLS(async (db) => {
		const docs = await db.select().from(document).where(inArray(document.id, ids));

		const versionIds = docs
			.filter((d) => d.draftContent === null && d.currentVersionId)
			.map((d) => d.currentVersionId as string);
		const versions = versionIds.length
			? await db
					.select({ id: documentVersion.id, content: documentVersion.content })
					.from(documentVersion)
					.where(inArray(documentVersion.id, versionIds))
			: [];
		const versionContent = new Map(versions.map((v) => [v.id, v.content]));

		return docs.map((d) => ({
			id: d.id,
			title: d.title,
			content:
				d.draftContent ?? (d.currentVersionId ? (versionContent.get(d.currentVersionId) ?? '') : '')
		}));
	})) as { id: string; title: string; content: string }[];

	const rendered = await Promise.allSettled(
		rows.map(async (r) => ({
			id: r.id,
			title: r.title,
			svg: await renderMermaidToSvgServer(r.content)
		}))
	);

	const diagrams: DiagramSvgMap = new Map();
	for (const result of rendered) {
		if (result.status === 'fulfilled') {
			diagrams.set(result.value.id, { svg: result.value.svg, title: result.value.title });
		}
	}
	return diagrams;
}

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
		const { typst: typ } = toTypst(docResult.content, docResult.title, refs);
		return new Response(typ, {
			headers: {
				'Content-Type': 'text/plain; charset=utf-8',
				'Content-Disposition': `attachment; filename="${slug}.typ"`
			}
		});
	} else {
		const diagrams = await resolveDiagramSvgs(event, docResult.content);
		const { typst: typ, diagramFiles } = toTypst(
			docResult.content,
			docResult.title,
			refs,
			diagrams
		);
		const bib = serializeBib(refs);
		const files = { ...(bib ? { 'refs.bib': bib } : {}), ...diagramFiles };
		let pdf: Uint8Array;
		try {
			pdf = await compileToPdf(typ, undefined, Object.keys(files).length ? files : undefined);
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
