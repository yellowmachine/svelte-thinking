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

export const versionSharesRouter = router({
	/**
	 * Crea una URL pública para un commit concreto, o devuelve la existente si ya hay una activa.
	 * Solo el owner del documento puede hacerlo.
	 */
	create: protectedProcedure
		.input(z.object({ versionId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			return ctx.withRLS(async (db) => {
				// Verificar que la versión existe y obtener el documentId
				const versionRows = await db
					.select({ id: documentVersion.id, documentId: documentVersion.documentId })
					.from(documentVersion)
					.where(eq(documentVersion.id, input.versionId))
					.limit(1);

				if (!versionRows[0]) {
					throw new TRPCError({ code: 'NOT_FOUND', message: 'Version not found' });
				}

				const { documentId } = versionRows[0];

				// Verificar ownership
				const docRows = await db
					.select({ ownerUserId: document.ownerUserId })
					.from(document)
					.where(eq(document.id, documentId))
					.limit(1);

				if (!docRows[0] || docRows[0].ownerUserId !== ctx.user.id) {
					throw new TRPCError({
						code: 'FORBIDDEN',
						message: 'Only the document owner can share versions'
					});
				}

				// Buscar share activo existente para este commit
				const now = new Date();
				const existing = await db
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

				await db.insert(documentVersionShare).values({
					id,
					versionId: input.versionId,
					documentId,
					token,
					createdBy: ctx.user.id,
					expiresAt,
					revokedAt: null
				});

				return { id, token, expiresAt };
			});
		}),

	/**
	 * Revoca (elimina) una URL pública. Solo el owner del documento puede hacerlo.
	 */
	revoke: protectedProcedure
		.input(z.object({ shareId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			return ctx.withRLS(async (db) => {
				const shareRows = await db
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
				const docRows = await db
					.select({ ownerUserId: document.ownerUserId })
					.from(document)
					.where(eq(document.id, shareRows[0].documentId))
					.limit(1);

				if (!docRows[0] || docRows[0].ownerUserId !== ctx.user.id) {
					throw new TRPCError({
						code: 'FORBIDDEN',
						message: 'Only the document owner can revoke shares'
					});
				}

				await db.delete(documentVersionShare).where(eq(documentVersionShare.id, input.shareId));

				return { ok: true };
			});
		}),

	/**
	 * Devuelve un mapa versionId → share activo para todos los commits de un documento.
	 * Solo el owner del documento puede consultarlo.
	 */
	listByDocument: protectedProcedure
		.input(z.object({ documentId: z.string() }))
		.query(async ({ ctx, input }) => {
			return ctx.withRLS(async (db) => {
				const docRows = await db
					.select({ ownerUserId: document.ownerUserId })
					.from(document)
					.where(eq(document.id, input.documentId))
					.limit(1);

				if (!docRows[0] || docRows[0].ownerUserId !== ctx.user.id) {
					return {};
				}

				const now = new Date();
				const shares = await db
					.select({
						id: documentVersionShare.id,
						versionId: documentVersionShare.versionId,
						token: documentVersionShare.token,
						expiresAt: documentVersionShare.expiresAt
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
			});
		}),

	/**
	 * Para /projects: devuelve los projectIds (de los proporcionados) con shares activos.
	 */
	activeShareProjectIds: protectedProcedure
		.input(z.object({ projectIds: z.array(z.string()) }))
		.query(async ({ ctx, input }) => {
			if (input.projectIds.length === 0) return [];

			return ctx.withRLS(async (db) => {
				const now = new Date();
				const rows = await db
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
			});
		}),

	/**
	 * Para la vista de proyecto: devuelve los documentIds con shares activos.
	 */
	activeShareDocumentIds: protectedProcedure
		.input(z.object({ projectId: z.string() }))
		.query(async ({ ctx, input }) => {
			return ctx.withRLS(async (db) => {
				const now = new Date();
				const rows = await db
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
			});
		})
});
