import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../init';
import { document, documentVersion } from '$lib/server/db/schemas/documents.schema';

const documentTypeValues = [
	'paper',
	'notes',
	'outline',
	'bibliography',
	'supplementary'
] as const;

export const documentsRouter = router({
	list: protectedProcedure.input(z.string()).query(async ({ ctx, input: projectId }) => {
		return ctx.withRLS((db) =>
			db.select().from(document).where(eq(document.projectId, projectId))
		);
	}),

	byId: protectedProcedure.input(z.string()).query(async ({ ctx, input }) => {
		const rows = await ctx.withRLS((db) =>
			db.select().from(document).where(eq(document.id, input)).limit(1)
		);
		if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
		return rows[0];
	}),

	// Documento con contenido listo para el editor:
	// si hay draft lo devuelve, si no devuelve el último commit
	withContent: protectedProcedure.input(z.string()).query(async ({ ctx, input }) => {
		const rows = await ctx.withRLS(async (db) => {
			const docs = await db.select().from(document).where(eq(document.id, input)).limit(1);
			if (!docs[0]) return [];

			// Draft tiene prioridad sobre la versión commiteada
			if (docs[0].draftContent !== null) {
				return [{ ...docs[0], content: docs[0].draftContent, hasDraft: true }];
			}

			if (!docs[0].currentVersionId) {
				return [{ ...docs[0], content: '', hasDraft: false }];
			}

			const versions = await db
				.select()
				.from(documentVersion)
				.where(eq(documentVersion.id, docs[0].currentVersionId))
				.limit(1);

			return [{ ...docs[0], content: versions[0]?.content ?? '', hasDraft: false }];
		});

		if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
		return rows[0];
	}),

	create: protectedProcedure
		.input(
			z.object({
				projectId: z.string(),
				title: z.string().min(1).max(255),
				type: z.enum(documentTypeValues).default('paper')
			})
		)
		.mutation(async ({ ctx, input }) => {
			const docId = crypto.randomUUID();

			return ctx.withRLS(async (db) => {
				const [created] = await db
					.insert(document)
					.values({ id: docId, projectId: input.projectId, title: input.title, type: input.type })
					.returning();

				// Versión inicial vacía (v1)
				const versionId = crypto.randomUUID();
				await db.insert(documentVersion).values({
					id: versionId,
					documentId: docId,
					content: '',
					versionNumber: 1,
					changeDescription: 'Versión inicial',
					createdBy: ctx.user.id
				});

				const [updated] = await db
					.update(document)
					.set({ currentVersionId: versionId })
					.where(eq(document.id, docId))
					.returning();

				return updated;
			});
		}),

	update: protectedProcedure
		.input(z.object({ id: z.string(), title: z.string().min(1).max(255).optional() }))
		.mutation(async ({ ctx, input }) => {
			const { id, ...data } = input;
			const rows = await ctx.withRLS((db) =>
				db
					.update(document)
					.set({ ...data, updatedAt: new Date() })
					.where(eq(document.id, id))
					.returning()
			);
			if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
			return rows[0];
		}),

	delete: protectedProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
		const rows = await ctx.withRLS((db) =>
			db.delete(document).where(eq(document.id, input)).returning({ id: document.id })
		);
		if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
		return rows[0];
	}),

	// Auto-save: persiste el borrador sin crear versión.
	// Llamado cada ~30s mientras el usuario escribe.
	saveDraft: protectedProcedure
		.input(z.object({ documentId: z.string(), content: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const rows = await ctx.withRLS((db) =>
				db
					.update(document)
					.set({ draftContent: input.content, updatedAt: new Date() })
					.where(eq(document.id, input.documentId))
					.returning({ id: document.id, updatedAt: document.updatedAt })
			);
			if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
			return rows[0];
		}),

	// Commit: crea una versión numerada a partir del draft actual.
	// Requiere mensaje. Limpia el draft tras commitear.
	commit: protectedProcedure
		.input(
			z.object({
				documentId: z.string(),
				message: z.string().min(1).max(500)
			})
		)
		.mutation(async ({ ctx, input }) => {
			return ctx.withRLS(async (db) => {
				const docs = await db
					.select()
					.from(document)
					.where(eq(document.id, input.documentId))
					.limit(1);

				if (!docs[0]) throw new TRPCError({ code: 'NOT_FOUND' });

				// El contenido a commitear es el draft; si no hay draft, no hay nada nuevo
				const contentToCommit = docs[0].draftContent;
				if (contentToCommit === null) {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: 'No hay cambios sin commitear'
					});
				}

				const latest = await db
					.select({ versionNumber: documentVersion.versionNumber })
					.from(documentVersion)
					.where(eq(documentVersion.documentId, input.documentId))
					.orderBy(desc(documentVersion.versionNumber))
					.limit(1);

				const nextVersion = (latest[0]?.versionNumber ?? 0) + 1;
				const versionId = crypto.randomUUID();

				await db.insert(documentVersion).values({
					id: versionId,
					documentId: input.documentId,
					content: contentToCommit,
					versionNumber: nextVersion,
					changeDescription: input.message,
					createdBy: ctx.user.id
				});

				const [updated] = await db
					.update(document)
					.set({ currentVersionId: versionId, draftContent: null, updatedAt: new Date() })
					.where(eq(document.id, input.documentId))
					.returning();

				return { document: updated, versionNumber: nextVersion };
			});
		}),

	// Historial de versiones (commits), sin contenido
	versions: protectedProcedure.input(z.string()).query(async ({ ctx, input: documentId }) => {
		return ctx.withRLS((db) =>
			db
				.select({
					id: documentVersion.id,
					versionNumber: documentVersion.versionNumber,
					changeDescription: documentVersion.changeDescription,
					createdBy: documentVersion.createdBy,
					createdAt: documentVersion.createdAt
				})
				.from(documentVersion)
				.where(eq(documentVersion.documentId, documentId))
				.orderBy(desc(documentVersion.versionNumber))
		);
	}),

	// Contenido completo de una versión específica (para diff o restaurar)
	versionContent: protectedProcedure.input(z.string()).query(async ({ ctx, input: versionId }) => {
		const rows = await ctx.withRLS((db) =>
			db.select().from(documentVersion).where(eq(documentVersion.id, versionId)).limit(1)
		);
		if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
		return rows[0];
	}),

	// Restaura una versión anterior: la copia como nuevo draft (sin commitear)
	// El usuario puede revisar antes de hacer commit
	restoreVersion: protectedProcedure
		.input(z.object({ documentId: z.string(), versionId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			return ctx.withRLS(async (db) => {
				const source = await db
					.select()
					.from(documentVersion)
					.where(eq(documentVersion.id, input.versionId))
					.limit(1);

				if (!source[0]) throw new TRPCError({ code: 'NOT_FOUND' });

				// Restaurar = poner el contenido como draft, el usuario confirma con commit
				const [updated] = await db
					.update(document)
					.set({ draftContent: source[0].content, updatedAt: new Date() })
					.where(eq(document.id, input.documentId))
					.returning();

				return { document: updated, restoredFromVersion: source[0].versionNumber };
			});
		})
});
