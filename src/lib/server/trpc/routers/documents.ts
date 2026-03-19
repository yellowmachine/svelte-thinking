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

const createDocumentSchema = z.object({
	projectId: z.string(),
	title: z.string().min(1).max(255),
	type: z.enum(documentTypeValues).default('paper')
});

const updateDocumentSchema = z.object({
	id: z.string(),
	title: z.string().min(1).max(255).optional()
});

const saveVersionSchema = z.object({
	documentId: z.string(),
	content: z.string(),
	changeDescription: z.string().max(500).optional()
});

export const documentsRouter = router({
	// Lista documentos de un proyecto
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

	// Retorna el documento con el contenido de su versión actual
	withContent: protectedProcedure.input(z.string()).query(async ({ ctx, input }) => {
		const rows = await ctx.withRLS(async (db) => {
			const docs = await db
				.select()
				.from(document)
				.where(eq(document.id, input))
				.limit(1);

			if (!docs[0]) return [];

			if (!docs[0].currentVersionId) return [{ ...docs[0], content: '' }];

			const versions = await db
				.select()
				.from(documentVersion)
				.where(eq(documentVersion.id, docs[0].currentVersionId))
				.limit(1);

			return [{ ...docs[0], content: versions[0]?.content ?? '' }];
		});

		if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
		return rows[0];
	}),

	create: protectedProcedure.input(createDocumentSchema).mutation(async ({ ctx, input }) => {
		const docId = crypto.randomUUID();

		return ctx.withRLS(async (db) => {
			const [created] = await db
				.insert(document)
				.values({
					id: docId,
					projectId: input.projectId,
					title: input.title,
					type: input.type
				})
				.returning();

			// Crea la versión inicial vacía
			const versionId = crypto.randomUUID();
			await db.insert(documentVersion).values({
				id: versionId,
				documentId: docId,
				content: '',
				versionNumber: 1,
				createdBy: ctx.user.id
			});

			// Apunta el documento a su versión inicial
			const [updated] = await db
				.update(document)
				.set({ currentVersionId: versionId })
				.where(eq(document.id, docId))
				.returning();

			return updated;
		});
	}),

	update: protectedProcedure.input(updateDocumentSchema).mutation(async ({ ctx, input }) => {
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

	// Guarda el contenido como nueva versión (usado por auto-save y guardado manual)
	saveVersion: protectedProcedure.input(saveVersionSchema).mutation(async ({ ctx, input }) => {
		return ctx.withRLS(async (db) => {
			// Obtiene el número de versión más alto actual
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
				content: input.content,
				versionNumber: nextVersion,
				changeDescription: input.changeDescription,
				createdBy: ctx.user.id
			});

			const [updated] = await db
				.update(document)
				.set({ currentVersionId: versionId, updatedAt: new Date() })
				.where(eq(document.id, input.documentId))
				.returning();

			return { document: updated, versionNumber: nextVersion };
		});
	}),

	// Historial de versiones (sin contenido para no sobrecargar)
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

	// Contenido de una versión específica
	versionContent: protectedProcedure.input(z.string()).query(async ({ ctx, input: versionId }) => {
		const rows = await ctx.withRLS((db) =>
			db.select().from(documentVersion).where(eq(documentVersion.id, versionId)).limit(1)
		);

		if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
		return rows[0];
	}),

	// Restaura una versión anterior como la versión actual
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

				const latest = await db
					.select({ versionNumber: documentVersion.versionNumber })
					.from(documentVersion)
					.where(eq(documentVersion.documentId, input.documentId))
					.orderBy(desc(documentVersion.versionNumber))
					.limit(1);

				const nextVersion = (latest[0]?.versionNumber ?? 0) + 1;
				const newVersionId = crypto.randomUUID();

				await db.insert(documentVersion).values({
					id: newVersionId,
					documentId: input.documentId,
					content: source[0].content,
					versionNumber: nextVersion,
					changeDescription: `Restaurado desde versión ${source[0].versionNumber}`,
					createdBy: ctx.user.id
				});

				const [updated] = await db
					.update(document)
					.set({ currentVersionId: newVersionId, updatedAt: new Date() })
					.where(eq(document.id, input.documentId))
					.returning();

				return { document: updated, versionNumber: nextVersion };
			});
		})
});
