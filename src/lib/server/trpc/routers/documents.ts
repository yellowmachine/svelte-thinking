import { z } from 'zod';
import { eq, desc, asc, and, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../init';
import { document, documentVersion } from '$lib/server/db/schemas/documents.schema';
import { documentLink } from '$lib/server/db/schemas/documentLinks.schema';
import { projectContextLink } from '$lib/server/db/schemas/contextLinks.schema';
import { extractWikilinks } from '$lib/utils/wikilinks';
import { indexDocument } from '$lib/server/embeddings';

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
				try {
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
						.where(eq(document.id, created.id))
						.returning();

					return updated;
				} catch (e: unknown) {
					if (e instanceof Error && e.message.includes('document_project_title_idx')) {
						throw new TRPCError({
							code: 'CONFLICT',
							message: `Ya existe un documento con el título "${input.title}" en este proyecto.`
						});
					}
					throw e;
				}
			});
		}),

	update: protectedProcedure
		.input(z.object({
			id: z.string(),
			title: z.string().min(1).max(255).optional(),
			isPublic: z.boolean().optional()
		}))
		.mutation(async ({ ctx, input }) => {
			const { id, ...data } = input;
			try {
				const rows = await ctx.withRLS((db) =>
					db
						.update(document)
						.set({ ...data, updatedAt: new Date() })
						.where(eq(document.id, id))
						.returning()
				);
				if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
				return rows[0];
			} catch (e: unknown) {
				if (e instanceof Error && e.message.includes('document_project_title_idx')) {
					throw new TRPCError({
						code: 'CONFLICT',
						message: `Ya existe un documento con ese título en este proyecto.`
					});
				}
				throw e;
			}
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
			const result = await ctx.withRLS(async (db) => {
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

				// ── Update wikilink index ──────────────────────────────────────
				// Handles [[title]] (same project) and [[title:hash]] (external).
				const titles = extractWikilinks(contentToCommit);

				await db
					.delete(documentLink)
					.where(eq(documentLink.sourceDocumentId, input.documentId));

				if (titles.length > 0 && updated.projectId) {
					const [sameProjectDocs, externalDocs] = await Promise.all([
						// Same-project: resolve by title
						db
							.select({ id: document.id, title: document.title })
							.from(document)
							.where(eq(document.projectId, updated.projectId)),

						// External context links: resolve by [[title:hash]] (first 8 chars of ID)
						db
							.select({ id: document.id, title: document.title })
							.from(projectContextLink)
							.innerJoin(document, eq(document.id, projectContextLink.linkedDocumentId))
							.where(eq(projectContextLink.projectId, updated.projectId))
					]);

					const titleToId = new Map(sameProjectDocs.map((d) => [d.title, d.id]));
					// External: keyed as "title:hash"
					for (const d of externalDocs) {
						titleToId.set(`${d.title}:${d.id.slice(0, 8)}`, d.id);
					}

					const newLinks = titles
						.map((t) => titleToId.get(t))
						.filter((id): id is string => !!id && id !== input.documentId);

					if (newLinks.length > 0) {
						await db.insert(documentLink).values(
							[...new Set(newLinks)].map((targetId) => ({
								id: crypto.randomUUID(),
								sourceDocumentId: input.documentId,
								targetDocumentId: targetId
							}))
						);
					}
				}

				return { document: updated, versionNumber: nextVersion, _projectId: updated.projectId, _content: contentToCommit };
			});

			// Fire-and-forget outside the transaction so tx is already committed
			ctx.withRLS((db) =>
				indexDocument(db, input.documentId, result._projectId, result._content)
			).catch((err) => console.error('[embeddings] indexDocument failed:', err));

			return { document: result.document, versionNumber: result.versionNumber };
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

	// Diff de una versión respecto a su predecesora inmediata.
	// Devuelve { current, previous } donde previous es null si es la primera versión.
	versionDiff: protectedProcedure
		.input(z.object({ documentId: z.string(), versionId: z.string() }))
		.query(async ({ ctx, input }) => {
			const rows = (await ctx.withRLS((db) =>
				db
					.select({
						id: documentVersion.id,
						versionNumber: documentVersion.versionNumber,
						content: documentVersion.content
					})
					.from(documentVersion)
					.where(eq(documentVersion.documentId, input.documentId))
					.orderBy(asc(documentVersion.versionNumber))
			)) as { id: string; versionNumber: number; content: string }[];

			const idx = rows.findIndex((v) => v.id === input.versionId);
			if (idx === -1) throw new TRPCError({ code: 'NOT_FOUND' });

			return {
				current: rows[idx],
				previous: idx > 0 ? rows[idx - 1] : null
			};
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
