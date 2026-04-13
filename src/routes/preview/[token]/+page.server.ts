import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { eq, and, gt, isNull } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	document,
	documentVersion,
	documentVersionShare
} from '$lib/server/db/schemas/documents.schema';

export const load: PageServerLoad = async ({ params }) => {
	const { token } = params;

	// 1. Validar el token — dvshare_public_read permite este SELECT sin contexto de usuario
	const now = new Date();
	const shareRows = await db
		.select({
			id: documentVersionShare.id,
			versionId: documentVersionShare.versionId,
			documentId: documentVersionShare.documentId,
			createdBy: documentVersionShare.createdBy,
			expiresAt: documentVersionShare.expiresAt
		})
		.from(documentVersionShare)
		.where(
			and(
				eq(documentVersionShare.token, token),
				isNull(documentVersionShare.revokedAt),
				gt(documentVersionShare.expiresAt, now)
			)
		)
		.limit(1);

	if (!shareRows[0]) {
		error(404, 'Este enlace no existe o ha expirado');
	}

	const share = shareRows[0];

	// 2. Impersonar al owner para leer el documento y la versión (RLS lo permite)
	const [docRows, versionRows] = await db.transaction(async (tx) => {
		await tx.execute(
			sql`SELECT set_config('app.current_user_id', ${share.createdBy}, true)`
		);
		await tx.execute(sql`SET LOCAL search_path = scholio, public`);

		return Promise.all([
			tx
				.select({
					id: document.id,
					title: document.title,
					type: document.type,
					projectId: document.projectId
				})
				.from(document)
				.where(eq(document.id, share.documentId))
				.limit(1),
			tx
				.select({
					id: documentVersion.id,
					content: documentVersion.content,
					versionNumber: documentVersion.versionNumber,
					changeDescription: documentVersion.changeDescription,
					createdAt: documentVersion.createdAt
				})
				.from(documentVersion)
				.where(eq(documentVersion.id, share.versionId))
				.limit(1)
		]);
	});

	if (!docRows[0] || !versionRows[0]) {
		error(404, 'Este enlace no existe o ha expirado');
	}

	return {
		document: docRows[0],
		version: versionRows[0],
		expiresAt: share.expiresAt
	};
};
