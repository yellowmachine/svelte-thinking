import { error } from '@sveltejs/kit';
import { eq, asc } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { documentVersion, document } from '$lib/server/db/schemas/documents.schema';

export const load: PageServerLoad = async (event) => {
	const { docId, versionId } = event.params;

	const [rows, docRows] = await Promise.all([
		event.locals.withRLS((db) =>
			db
				.select({
					id: documentVersion.id,
					versionNumber: documentVersion.versionNumber,
					content: documentVersion.content,
					changeDescription: documentVersion.changeDescription,
					createdAt: documentVersion.createdAt
				})
				.from(documentVersion)
				.where(eq(documentVersion.documentId, docId))
				.orderBy(asc(documentVersion.versionNumber))
		) as Promise<
			{
				id: string;
				versionNumber: number;
				content: string;
				changeDescription: string | null;
				createdAt: Date;
			}[]
		>,
		event.locals.withRLS((db) =>
			db.select({ title: document.title }).from(document).where(eq(document.id, docId)).limit(1)
		) as Promise<{ title: string }[]>
	]);

	const idx = rows.findIndex((v) => v.id === versionId);
	if (idx === -1) error(404, 'Versión no encontrada');

	return {
		documentTitle: docRows[0]?.title ?? '',
		current: rows[idx],
		previous: idx > 0 ? rows[idx - 1] : null
	};
};
