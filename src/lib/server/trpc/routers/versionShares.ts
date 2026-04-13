import { z } from 'zod';
import { eq, and, gt, isNull, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../init';
import {
	document,
	documentVersion,
	documentVersionShare
} from '$lib/server/db/schemas/documents.schema';

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

function isActive(share: { expiresAt: Date; revokedAt: Date | null }): boolean {
	return share.revokedAt === null && share.expiresAt > new Date();
}

export const versionSharesRouter = router({
	/**
	 * Crea una URL pública para un commit concreto, o devuelve la existente si ya hay una activa.
	 * Solo el owner del documento puede hacerlo.
	 */
	create: protectedProcedure
		.input(z.object({ versionId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			// Verificar que la versión existe y obtener el documentId
			const versionRows = await ctx.db
				.select({ id: documentVersion.id, documentId: documentVersion.documentId })
				.from(documentVersion)
				.where(eq(documentVersion.id, input.versionId))
				.limit(1);

			if (!versionRows[0]) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Version not found' });
			}

			const { documentId } = versionRows[0];

			// Verificar ownership
			const docRows = await ctx.db
				.select({ ownerUserId: document.ownerUserId })
				.from(document)
				.where(eq(document.id, documentId))
				.limit(1);

			if (!docRows[0] || docRows[0].ownerUserId !== ctx.user.id) {
				throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the document owner can share versions' });
			}

			// Buscar share activo existente para este commit
			const now = new Date();
			const existing = await ctx.db
				.select()
				.from(documentVersionShare)
				.where(
					and(
						eq(documentVersionShare.versionId, input.versionId),
						isNull(documentVersionShare.revokedAt),
						gt(documentVersionShare.expiresAt, now)
					)
				)
				.limit(1);

			if (existing[0]) {
				return { id: existing[0].id, token: existing[0].token, expiresAt: existing[0].expiresAt };
			}

			// Crear nuevo share
			const id = crypto.randomUUID();
			const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
			const expiresAt = new Date(Date.now() + TTL_MS);

			await ctx.db.insert(documentVersionShare).values({
				id,
				versionId: input.versionId,
				documentId,
				token,
				createdBy: ctx.user.id,
				expiresAt,
				revokedAt: null
			});

			return { id, token, expiresAt };
		}),

	/**
	 * Revoca (elimina) una URL pública. Solo el owner del documento puede hacerlo.
	 */
	revoke: protectedProcedure
		.input(z.object({ shareId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const shareRows = await ctx.db
				.select({
					id: documentVersionShare.id,
					documentId: documentVersionShare.documentId
				})
				.from(documentVersionShare)
				.where(eq(documentVersionShare.id, input.shareId))
				.limit(1);

			if (!shareRows[0]) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Share not found' });
			}

			// Verificar ownership
			const docRows = await ctx.db
				.select({ ownerUserId: document.ownerUserId })
				.from(document)
				.where(eq(document.id, shareRows[0].documentId))
				.limit(1);

			if (!docRows[0] || docRows[0].ownerUserId !== ctx.user.id) {
				throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the document owner can revoke shares' });
			}

			await ctx.db
				.delete(documentVersionShare)
				.where(eq(documentVersionShare.id, input.shareId));

			return { ok: true };
		}),

	/**
	 * Devuelve un mapa versionId → share para todos los commits de un documento.
	 * Solo devuelve shares activos (no expirados, no revocados).
	 * Solo el owner del documento puede consultarlo.
	 */
	listByDocument: protectedProcedure
		.input(z.object({ documentId: z.string() }))
		.query(async ({ ctx, input }) => {
			// Verificar ownership
			const docRows = await ctx.db
				.select({ ownerUserId: document.ownerUserId })
				.from(document)
				.where(eq(document.id, input.documentId))
				.limit(1);

			if (!docRows[0] || docRows[0].ownerUserId !== ctx.user.id) {
				return {};
			}

			const now = new Date();
			const shares = await ctx.db
				.select({
					id: documentVersionShare.id,
					versionId: documentVersionShare.versionId,
					token: documentVersionShare.token,
					expiresAt: documentVersionShare.expiresAt,
					revokedAt: documentVersionShare.revokedAt
				})
				.from(documentVersionShare)
				.where(
					and(
						eq(documentVersionShare.documentId, input.documentId),
						isNull(documentVersionShare.revokedAt),
						gt(documentVersionShare.expiresAt, now)
					)
				);

			return Object.fromEntries(
				shares.map((s) => [s.versionId, { id: s.id, token: s.token, expiresAt: s.expiresAt }])
			);
		}),

	/**
	 * Devuelve true si algún documento del proyecto (que sea owner) tiene shares activos.
	 * Usado para el punto azul en la lista de proyectos.
	 */
	projectHasActiveShares: protectedProcedure
		.input(z.object({ projectId: z.string() }))
		.query(async ({ ctx, input }) => {
			const now = new Date();
			const rows = await ctx.db
				.select({ id: documentVersionShare.id })
				.from(documentVersionShare)
				.innerJoin(document, eq(document.id, documentVersionShare.documentId))
				.where(
					and(
						eq(document.projectId, input.projectId),
						eq(document.ownerUserId, ctx.user.id),
						isNull(documentVersionShare.revokedAt),
						gt(documentVersionShare.expiresAt, now)
					)
				)
				.limit(1);

			return rows.length > 0;
		}),

	/**
	 * Para /projects: devuelve el set de projectIds (de los proporcionados) que tienen shares activos.
	 * Evita N+1 queries en la lista de proyectos.
	 */
	activeShareProjectIds: protectedProcedure
		.input(z.object({ projectIds: z.array(z.string()) }))
		.query(async ({ ctx, input }) => {
			if (input.projectIds.length === 0) return [];

			const now = new Date();
			const rows = await ctx.db
				.selectDistinct({ projectId: document.projectId })
				.from(documentVersionShare)
				.innerJoin(document, eq(document.id, documentVersionShare.documentId))
				.where(
					and(
						inArray(document.projectId, input.projectIds),
						eq(document.ownerUserId, ctx.user.id),
						isNull(documentVersionShare.revokedAt),
						gt(documentVersionShare.expiresAt, now)
					)
				);

			return rows.map((r) => r.projectId);
		}),

	/**
	 * Para la vista de proyecto: devuelve el set de documentIds que tienen shares activos.
	 */
	activeShareDocumentIds: protectedProcedure
		.input(z.object({ projectId: z.string() }))
		.query(async ({ ctx, input }) => {
			const now = new Date();
			const rows = await ctx.db
				.selectDistinct({ documentId: documentVersionShare.documentId })
				.from(documentVersionShare)
				.innerJoin(document, eq(document.id, documentVersionShare.documentId))
				.where(
					and(
						eq(document.projectId, input.projectId),
						eq(document.ownerUserId, ctx.user.id),
						isNull(documentVersionShare.revokedAt),
						gt(documentVersionShare.expiresAt, now)
					)
				);

			return rows.map((r) => r.documentId);
		})
});
