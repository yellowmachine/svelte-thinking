import { z } from 'zod';
import { eq, and, asc, ilike, or, sql, isNotNull, count, ne } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../init';
import {
	project,
	projectCollaborator,
	projectRoleEnum
} from '$lib/server/db/schemas/projects.schema';
import { document, documentVersion } from '$lib/server/db/schemas/documents.schema';
import { documentChunk } from '$lib/server/db/schemas/documentChunks.schema';
import { projectInterest } from '$lib/server/db/schemas/discover.schema';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { organization, organizationMember } from '$lib/server/db/schemas/organizations.schema';
import { user } from '$lib/server/db/auth.schema';
import { embedQuery, indexDocument } from '$lib/server/embeddings';
import { generateAndSaveDocumentSummary } from '$lib/server/documentSummary';
import { resolveTaskKey } from '$lib/server/trpc/routers/ai';
import { projectPhoto } from '$lib/server/db/schemas/photos.schema';
import { reference, projectReference } from '$lib/server/db/schemas/references.schema';
import { resolveProjectS3Config } from '$lib/server/s3Storage';
import { deleteFileWithConfig, uploadFileWithConfig } from '$lib/server/storage';
import { retrieveEphemeral } from '$lib/server/ephemeralStore';
import {
	isProjectOwner,
	canRemoveCollaborator,
	canChangeCollaboratorRole
} from '$lib/domain/permissions';
import { PROJECT_STATUSES } from '$lib/domain/project';
import { STARTER_DOCUMENTS } from '$lib/server/starterContent';
import { getSampleBySlug } from '$lib/server/sampleDocs';
import type { Db } from '$lib/server/db';

async function insertStarterDocuments(db: Db, projectId: string, userId: string) {
	for (const starter of STARTER_DOCUMENTS) {
		// Insert references first
		for (const ref of starter.references) {
			const refId = crypto.randomUUID();
			const inserted = await db
				.insert(reference)
				.values({
					id: refId,
					userId,
					citeKey: ref.citeKey,
					type: ref.type,
					title: ref.title,
					authors: ref.authors,
					year: ref.year,
					journal: ref.journal,
					volume: ref.volume,
					pages: ref.pages,
					doi: ref.doi,
					publisher: ref.publisher,
					address: ref.address,
					isbn: ref.isbn
				})
				.onConflictDoNothing()
				.returning({ id: reference.id });

			const actualRefId =
				inserted[0]?.id ??
				(
					await db
						.select({ id: reference.id })
						.from(reference)
						.where(and(eq(reference.userId, userId), eq(reference.citeKey, ref.citeKey)))
						.limit(1)
				)[0]?.id;

			if (actualRefId) {
				await db
					.insert(projectReference)
					.values({ referenceId: actualRefId, projectId })
					.onConflictDoNothing();
			}
		}

		// Insert document
		const docId = crypto.randomUUID();
		await db.insert(document).values({
			id: docId,
			projectId,
			title: starter.title,
			type: starter.type,
			generatedByAi: true,
			ownerUserId: userId
		});

		// Insert initial version with content
		const versionId = crypto.randomUUID();
		await db.insert(documentVersion).values({
			id: versionId,
			documentId: docId,
			content: starter.content,
			versionNumber: 1,
			changeDescription: 'AI-generated starter document',
			createdBy: userId
		});

		await db.update(document).set({ currentVersionId: versionId }).where(eq(document.id, docId));
	}
}

const createProjectSchema = z.object({
	title: z.string().min(1).max(255),
	description: z.string().max(2000).optional(),
	orgId: z.string().optional() // set when creating in an org workspace
});

const updateProjectSchema = z.object({
	id: z.string(),
	title: z.string().min(1).max(255).optional(),
	description: z.string().max(2000).nullable().optional(),
	status: z.enum(PROJECT_STATUSES).optional(),
	citationStyle: z.enum(['apa', 'ieee', 'vancouver', 'chicago']).nullable().optional(),
	doi: z.string().max(255).nullable().optional(),
	version: z.string().max(50).nullable().optional(),
	publishedAt: z.coerce.date().nullable().optional()
});

export const projectsRouter = router({
	list: protectedProcedure.query(async ({ ctx }) => {
		return ctx.withRLS((db) => db.select().from(project).orderBy(project.createdAt));
	}),

	listForQuickNote: protectedProcedure.query(async ({ ctx }) => {
		return ctx.withRLS((db) =>
			db.select({ id: project.id, title: project.title }).from(project).orderBy(asc(project.title))
		);
	}),

	byId: protectedProcedure.input(z.string()).query(async ({ ctx, input }) => {
		const rows = await ctx.withRLS((db) =>
			db.select().from(project).where(eq(project.id, input)).limit(1)
		);

		if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
		return rows[0];
	}),

	create: protectedProcedure.input(createProjectSchema).mutation(async ({ ctx, input }) => {
		const id = crypto.randomUUID();
		const userId = ctx.user.id;

		// If creating in an org workspace, verify the user is owner or admin
		if (input.orgId) {
			const isOwner = await ctx.db
				.select({ id: organization.id })
				.from(organization)
				.where(and(eq(organization.id, input.orgId), eq(organization.ownerId, userId)))
				.limit(1);

			const isAdmin = isOwner[0]
				? []
				: await ctx.db
						.select({ id: organizationMember.id })
						.from(organizationMember)
						.where(
							and(
								eq(organizationMember.orgId, input.orgId),
								eq(organizationMember.userId, userId),
								eq(organizationMember.role, 'admin')
							)
						)
						.limit(1);

			if (!isOwner[0] && !isAdmin[0]) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'Only org owners and admins can create projects in an organization.'
				});
			}
		}

		// Check if this is the user's first project (to seed starter documents)
		const [{ value: existingCount }] = (await ctx.withRLS((db) =>
			db.select({ value: count() }).from(project)
		)) as [{ value: number }];

		const isFirstProject = existingCount === 0;

		return ctx.withRLS(async (db) => {
			const [created] = await db
				.insert(project)
				.values({
					id,
					title: input.title,
					description: input.description,
					ownerId: userId,
					orgId: input.orgId ?? null
				})
				.returning();

			// El owner también se registra como colaborador para simplificar queries de permisos
			await db.insert(projectCollaborator).values({
				id: crypto.randomUUID(),
				projectId: id,
				userId,
				ownerUserId: userId,
				role: 'owner'
			});

			if (isFirstProject) {
				await insertStarterDocuments(db, id, userId);
			}

			return created;
		});
	}),

	update: protectedProcedure.input(updateProjectSchema).mutation(async ({ ctx, input }) => {
		const { id, ...data } = input;

		const rows = await ctx.withRLS((db) =>
			db
				.update(project)
				.set({ ...data, updatedAt: new Date() })
				.where(eq(project.id, id))
				.returning()
		);

		if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
		return rows[0];
	}),

	// Update the custom system prompt for the project agent (owner only)
	updateAgentPrompt: protectedProcedure
		.input(
			z.object({
				projectId: z.string(),
				agentSystemPrompt: z.string().max(4000).nullable()
			})
		)
		.mutation(async ({ ctx, input }) => {
			const rows = await ctx.withRLS((db) =>
				db
					.update(project)
					.set({ agentSystemPrompt: input.agentSystemPrompt, updatedAt: new Date() })
					.where(and(eq(project.id, input.projectId), eq(project.ownerId, ctx.user.id)))
					.returning({ id: project.id })
			);
			if (!rows[0]) throw new TRPCError({ code: 'FORBIDDEN' });
			return { ok: true };
		}),

	// Delete project — immediate if no collaborators, scheduled 7 days if collaborators exist
	delete: protectedProcedure.input(z.string()).mutation(async ({ ctx, input: projectId }) => {
		// Count non-owner collaborators
		const collabRows = await ctx.withRLS((db) =>
			db
				.select({ userId: projectCollaborator.userId })
				.from(projectCollaborator)
				.where(
					and(eq(projectCollaborator.projectId, projectId), ne(projectCollaborator.role, 'owner'))
				)
		);
		const hasCollaborators = collabRows.length > 0;

		if (!hasCollaborators) {
			// No collaborators — delete immediately via executeDeletion logic
			const [photoKeys, pdfKeys] = await Promise.all([
				ctx.withRLS((db) =>
					db
						.select({ key: projectPhoto.key })
						.from(projectPhoto)
						.where(eq(projectPhoto.projectId, projectId))
				),
				ctx.withRLS((db) =>
					db
						.select({ key: reference.pdfKey })
						.from(reference)
						.innerJoin(projectReference, eq(projectReference.referenceId, reference.id))
						.where(and(eq(projectReference.projectId, projectId), isNotNull(reference.pdfKey)))
				)
			]);

			const rows = await ctx.withRLS((db) =>
				db
					.delete(project)
					.where(and(eq(project.id, projectId), eq(project.ownerId, ctx.user.id)))
					.returning({ id: project.id, title: project.title })
			);
			if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });

			const s3 = await resolveProjectS3Config(projectId, ctx.user.id, ctx.withRLS).catch(
				() => null
			);
			if (s3) {
				const keys = [
					...photoKeys.map((r) => r.key),
					...pdfKeys.flatMap((r) => (r.key ? [r.key] : []))
				];
				await Promise.allSettled(keys.map((key) => deleteFileWithConfig(s3, key)));
			}

			return { ...rows[0], scheduledDeleteAt: null, immediate: true };
		}

		// Has collaborators — schedule deletion in 7 days
		const scheduledDeleteAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
		const rows = await ctx.withRLS((db) =>
			db
				.update(project)
				.set({ scheduledDeleteAt, updatedAt: new Date() })
				.where(and(eq(project.id, projectId), eq(project.ownerId, ctx.user.id)))
				.returning({ id: project.id, title: project.title })
		);

		if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
		return { ...rows[0], scheduledDeleteAt, immediate: false };
	}),

	// Cancel a scheduled deletion
	cancelDeletion: protectedProcedure
		.input(z.string())
		.mutation(async ({ ctx, input: projectId }) => {
			const rows = await ctx.withRLS((db) =>
				db
					.update(project)
					.set({ scheduledDeleteAt: null, updatedAt: new Date() })
					.where(and(eq(project.id, projectId), eq(project.ownerId, ctx.user.id)))
					.returning({ id: project.id })
			);

			if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
			return rows[0];
		}),

	// Execute the actual cascade deletion — called lazily on load or from admin
	executeDeletion: protectedProcedure
		.input(z.string())
		.mutation(async ({ ctx, input: projectId }) => {
			const [photoKeys, pdfKeys] = await Promise.all([
				ctx.withRLS((db) =>
					db
						.select({ key: projectPhoto.key })
						.from(projectPhoto)
						.where(eq(projectPhoto.projectId, projectId))
				),
				ctx.withRLS((db) =>
					db
						.select({ key: reference.pdfKey })
						.from(reference)
						.innerJoin(projectReference, eq(projectReference.referenceId, reference.id))
						.where(and(eq(projectReference.projectId, projectId), isNotNull(reference.pdfKey)))
				)
			]);

			const rows = await ctx.withRLS((db) =>
				db.delete(project).where(eq(project.id, projectId)).returning({ id: project.id })
			);

			if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });

			const s3 = await resolveProjectS3Config(projectId, ctx.user.id, ctx.withRLS).catch(
				() => null
			);
			if (s3) {
				const keys = [...photoKeys.map((r) => r.key), ...pdfKeys.map((r) => r.key as string)];
				await Promise.allSettled(keys.map((key) => deleteFileWithConfig(s3, key)));
			}

			return rows[0];
		}),

	// Colaboradores del proyecto
	collaborators: protectedProcedure.input(z.string()).query(async ({ ctx, input }) => {
		return ctx.withRLS((db) =>
			db.select().from(projectCollaborator).where(eq(projectCollaborator.projectId, input))
		);
	}),

	myRole: protectedProcedure.input(z.string()).query(async ({ ctx, input }) => {
		const rows = await ctx.withRLS((db) =>
			db
				.select({ role: projectCollaborator.role })
				.from(projectCollaborator)
				.where(
					and(eq(projectCollaborator.projectId, input), eq(projectCollaborator.userId, ctx.user.id))
				)
				.limit(1)
		);

		return rows[0]?.role ?? null;
	}),

	// Owner expulsa a un colaborador
	// Usa ctx.db (superuser) porque RLS en projectCollaborator solo permite ver la propia fila
	removeCollaborator: protectedProcedure
		.input(z.object({ projectId: z.string(), userId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const proj = await ctx.withRLS((db) =>
				db
					.select({ ownerId: project.ownerId })
					.from(project)
					.where(eq(project.id, input.projectId))
					.limit(1)
			);

			if (!proj[0]) throw new TRPCError({ code: 'NOT_FOUND' });
			if (!canRemoveCollaborator(ctx.user.id, proj[0].ownerId, input.userId)) {
				throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot remove the project owner.' });
			}

			await ctx.withRLS((db) =>
				db
					.delete(projectCollaborator)
					.where(
						and(
							eq(projectCollaborator.projectId, input.projectId),
							eq(projectCollaborator.userId, input.userId)
						)
					)
			);
		}),

	// Owner cambia el rol de un colaborador.
	// El rol del propio owner no se puede cambiar.
	changeRole: protectedProcedure
		.input(
			z.object({
				projectId: z.string(),
				userId: z.string(),
				role: z.enum(['author', 'coauthor', 'reviewer', 'commenter'])
			})
		)
		.mutation(async ({ ctx, input }) => {
			const proj = await ctx.withRLS((db) =>
				db
					.select({ ownerId: project.ownerId })
					.from(project)
					.where(eq(project.id, input.projectId))
					.limit(1)
			);

			if (!proj[0]) throw new TRPCError({ code: 'NOT_FOUND' });
			if (!canChangeCollaboratorRole(ctx.user.id, proj[0].ownerId, input.userId)) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'Cannot change the role of the project owner.'
				});
			}

			const [updated] = await ctx.withRLS((db) =>
				db
					.update(projectCollaborator)
					.set({ role: input.role })
					.where(
						and(
							eq(projectCollaborator.projectId, input.projectId),
							eq(projectCollaborator.userId, input.userId)
						)
					)
					.returning({ userId: projectCollaborator.userId, role: projectCollaborator.role })
			);

			if (!updated) throw new TRPCError({ code: 'NOT_FOUND' });
			return updated;
		}),

	// Owner activa/desactiva visibilidad pública del proyecto
	setSearchable: protectedProcedure
		.input(z.object({ id: z.string(), isSearchable: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			const rows = await ctx.withRLS((db) =>
				db
					.update(project)
					.set({ isSearchable: input.isSearchable, updatedAt: new Date() })
					.where(eq(project.id, input.id))
					.returning({ id: project.id, isSearchable: project.isSearchable })
			);
			if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
			return rows[0];
		}),

	// Busca proyectos buscables (ctx.db superuser + filtro is_searchable)
	// Devuelve proyecto + contenido del documento "Abstract" si existe
	// Con query: búsqueda semántica sobre document_chunk de Abstract; sin query: todos los buscables
	explore: protectedProcedure
		.input(z.object({ query: z.string().max(200).optional() }))
		.query(async ({ ctx, input }) => {
			let rows: Array<{
				id: string;
				title: string;
				description: string | null;
				ownerId: string;
				ownerName: string | null;
				ownerDisplayName: string | null;
				ownerInstitution: string | null;
				ownerOrcid: string | null;
				createdAt: Date;
			}>;

			if (input.query) {
				// Búsqueda semántica: embed query → cosine similarity sobre chunks de Abstract
				const embedding = await embedQuery(input.query);
				const vecLiteral = `[${embedding.join(',')}]`;

				const semanticRows = await ctx.db.execute(sql`
					SELECT DISTINCT ON (p.id)
						p.id,
						p.title,
						p.description,
						p.owner_id       AS "ownerId",
						u.name           AS "ownerName",
						up.display_name  AS "ownerDisplayName",
						up.institution   AS "ownerInstitution",
						up.orcid         AS "ownerOrcid",
						p.created_at     AS "createdAt",
						1 - (dc.embedding <=> '${sql.raw(vecLiteral)}'::vector) AS similarity
					FROM scholio.document_chunk dc
					JOIN scholio.document d ON d.id = dc.document_id AND d.title = 'Abstract'
					JOIN scholio.project p ON p.id = dc.project_id AND p.is_searchable = true
					JOIN "user" u ON u.id = p.owner_id
					LEFT JOIN scholio.user_profile up ON up.user_id = p.owner_id
					WHERE 1 - (dc.embedding <=> '${sql.raw(vecLiteral)}'::vector) > 0.25
					ORDER BY p.id, similarity DESC
				`);

				// Sort merged results by similarity descending
				rows = (
					semanticRows as unknown as Array<{
						id: string;
						title: string;
						description: string | null;
						ownerId: string;
						ownerName: string | null;
						ownerDisplayName: string | null;
						ownerInstitution: string | null;
						ownerOrcid: string | null;
						createdAt: Date;
						similarity: number;
					}>
				)
					.sort((a, b) => b.similarity - a.similarity)
					.map(({ similarity: _s, ...rest }) => rest);
			} else {
				// Sin query: todos los proyectos buscables ordenados por título
				rows = await ctx.db
					.select({
						id: project.id,
						title: project.title,
						description: project.description,
						ownerId: project.ownerId,
						ownerName: user.name,
						ownerDisplayName: userProfile.displayName,
						ownerInstitution: userProfile.institution,
						ownerOrcid: userProfile.orcid,
						createdAt: project.createdAt
					})
					.from(project)
					.innerJoin(user, eq(user.id, project.ownerId))
					.leftJoin(userProfile, eq(userProfile.userId, project.ownerId))
					.where(eq(project.isSearchable, true))
					.orderBy(asc(project.title));
			}

			// Para cada proyecto, busca el documento Abstract
			const projectIds = rows.map((r) => r.id);
			const abstracts =
				projectIds.length > 0
					? await ctx.db
							.select({
								projectId: document.projectId,
								content: document.draftContent
							})
							.from(document)
							.where(
								and(
									eq(document.title, 'Abstract'),
									projectIds.length === 1
										? eq(document.projectId, projectIds[0])
										: or(...projectIds.map((id) => eq(document.projectId, id)))
								)
							)
					: [];

			const abstractMap = Object.fromEntries(abstracts.map((a) => [a.projectId, a.content]));

			// Marca si el usuario ya hizo pin en cada proyecto
			const pins = await ctx.withRLS((db) =>
				db
					.select({ projectId: projectInterest.projectId })
					.from(projectInterest)
					.where(eq(projectInterest.userId, ctx.user.id))
			);
			const pinnedSet = new Set(pins.map((p) => p.projectId));

			return rows.map((r) => ({
				...r,
				abstractContent: abstractMap[r.id] ?? null,
				isPinned: pinnedSet.has(r.id)
			}));
		}),

	// Owner ve quién está interesado en su proyecto (con perfil del interesado)
	listInterested: protectedProcedure.input(z.string()).query(async ({ ctx, input: projectId }) => {
		// Verifica ownership
		const proj = await ctx.withRLS((db) =>
			db
				.select({ ownerId: project.ownerId })
				.from(project)
				.where(eq(project.id, projectId))
				.limit(1)
		);
		if (!proj[0]) throw new TRPCError({ code: 'NOT_FOUND' });
		if (!isProjectOwner(ctx.user.id, proj[0].ownerId)) throw new TRPCError({ code: 'FORBIDDEN' });

		// ctx.db para poder leer todos los interesados (RLS solo expone los del owner)
		return ctx.db
			.select({
				id: projectInterest.id,
				userId: projectInterest.userId,
				createdAt: projectInterest.createdAt,
				name: user.name,
				displayName: userProfile.displayName,
				institution: userProfile.institution,
				orcid: userProfile.orcid,
				bio: userProfile.bio
			})
			.from(projectInterest)
			.innerJoin(user, eq(user.id, projectInterest.userId))
			.leftJoin(userProfile, eq(userProfile.userId, projectInterest.userId))
			.where(eq(projectInterest.projectId, projectId))
			.orderBy(asc(projectInterest.createdAt));
	}),

	// Colaborador abandona el proyecto
	leave: protectedProcedure
		.input(z.string()) // projectId
		.mutation(async ({ ctx, input: projectId }) => {
			// withRLS para validar que el proyecto existe y el usuario tiene acceso
			const proj = (await ctx.withRLS((db) =>
				db
					.select({ ownerId: project.ownerId })
					.from(project)
					.where(eq(project.id, projectId))
					.limit(1)
			)) as { ownerId: string }[];

			if (!proj[0]) throw new TRPCError({ code: 'NOT_FOUND' });
			if (proj[0].ownerId === ctx.user.id) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'El owner no puede abandonar su propio proyecto.'
				});
			}

			await ctx.withRLS((db) =>
				db
					.delete(projectCollaborator)
					.where(
						and(
							eq(projectCollaborator.projectId, projectId),
							eq(projectCollaborator.userId, ctx.user.id)
						)
					)
			);
		}),

	// Creates a sample project from a help-page slug.
	// Each SampleDoc is inserted in order; {{DOC_n}} placeholders in content
	// are replaced with the UUID of the n-th created document.
	createFromSample: protectedProcedure.input(z.string()).mutation(async ({ ctx, input: slug }) => {
		const sample = getSampleBySlug(slug);
		if (!sample)
			throw new TRPCError({ code: 'NOT_FOUND', message: `No sample found for slug "${slug}"` });

		const userId = ctx.user.id;
		const projectId = crypto.randomUUID();

		const docsToIndex: Array<{ docId: string; content: string }> = [];
		const result = await ctx.withRLS(async (db) => {
			// Create the project
			const [created] = await db
				.insert(project)
				.values({
					id: projectId,
					title: sample.projectTitle,
					description: sample.tagline,
					ownerId: userId
				})
				.returning();

			await db.insert(projectCollaborator).values({
				id: crypto.randomUUID(),
				projectId,
				userId,
				ownerUserId: userId,
				role: 'owner'
			});

			// Insert references (deduplicated by citeKey within this project)
			const seenCiteKeys = new Set<string>();
			for (const doc of sample.docs) {
				for (const ref of doc.references ?? []) {
					if (seenCiteKeys.has(ref.citeKey)) continue;
					seenCiteKeys.add(ref.citeKey);
					const refId = crypto.randomUUID();
					const inserted = await db
						.insert(reference)
						.values({
							id: refId,
							userId,
							citeKey: ref.citeKey,
							type: ref.type,
							title: ref.title,
							authors: ref.authors,
							year: ref.year,
							journal: ref.journal,
							volume: ref.volume,
							pages: ref.pages,
							doi: ref.doi,
							publisher: ref.publisher,
							address: ref.address,
							isbn: ref.isbn
						})
						.onConflictDoNothing()
						.returning({ id: reference.id });

					// If the reference already existed (conflict), fetch its real id
					const actualRefId =
						inserted[0]?.id ??
						(
							await db
								.select({ id: reference.id })
								.from(reference)
								.where(and(eq(reference.userId, userId), eq(reference.citeKey, ref.citeKey)))
								.limit(1)
						)[0]?.id;

					if (actualRefId) {
						await db
							.insert(projectReference)
							.values({ referenceId: actualRefId, projectId })
							.onConflictDoNothing();
					}
				}
			}

			// Insert docs in order, collecting their UUIDs for placeholder substitution
			const docIds: string[] = [];

			for (const sampleDoc of sample.docs) {
				const docId = crypto.randomUUID();
				docIds.push(docId);

				// Substitute {{DOC_n}} placeholders with real UUIDs
				let content = sampleDoc.content;
				for (let i = 0; i < docIds.length; i++) {
					content = content.replaceAll(`{{DOC_${i}}}`, docIds[i]);
				}

				await db.insert(document).values({
					id: docId,
					projectId,
					title: sampleDoc.title,
					type: sampleDoc.docType,
					ownerUserId: userId
				});

				const versionId = crypto.randomUUID();
				await db.insert(documentVersion).values({
					id: versionId,
					documentId: docId,
					content,
					versionNumber: 1,
					changeDescription: 'Sample document from help page',
					createdBy: userId
				});

				await db
					.update(document)
					.set({ currentVersionId: versionId })
					.where(eq(document.id, docId));

				docsToIndex.push({ docId, content });

				// Fire-and-forget: AI summary for the project chat agent
				const _title = sampleDoc.title;
				const _type = sampleDoc.docType;
				void (async () => {
					try {
						const { apiKey, model } = await resolveTaskKey(
							ctx.withRLS as never,
							ctx.db as Db,
							userId,
							'summary',
							projectId
						);
						await generateAndSaveDocumentSummary(
							db as Db,
							versionId,
							content,
							_title,
							_type,
							apiKey,
							model
						);
					} catch (err) {
						console.error('[summary] generateDocumentSummary failed (sample):', err);
					}
				})();
			}

			return { projectId };
		});

		// Index outside the transaction — each call gets its own RLS context so
		// SET LOCAL app.current_user_id is set when the INSERT runs
		for (const { docId, content } of docsToIndex) {
			ctx
				.withRLS((db) => indexDocument(db, docId, projectId, content))
				.catch((err) => console.error('[embeddings] indexDocument failed (sample):', err));
		}

		return result;
	}),

	importEpub: protectedProcedure
		.input(
			z.object({
				projectId: z.string(),
				url: z.union([z.string().url().max(2000), z.string().startsWith('eph://').max(50)]),
				referenceId: z.string().optional()
			})
		)
		.mutation(async ({ ctx, input }) => {
			const { projectId, url, referenceId: providedReferenceId } = input;

			// Mark project as importing
			await ctx.withRLS((db) =>
				db.update(project).set({ isImporting: true }).where(eq(project.id, projectId))
			);

			// Run in background — response returns immediately
			(async () => {
				const log = (...args: unknown[]) => console.log('[importEpub]', ...args);
				try {
					log('start', { projectId, url });

					// Load EPUB buffer
					let buffer: Uint8Array;
					if (url.startsWith('eph://')) {
						const ephBuffer = retrieveEphemeral(url);
						if (!ephBuffer) throw new Error('Ephemeral file not found or expired');
						buffer = ephBuffer;
						log('loaded from ephemeral store', buffer.byteLength, 'bytes');
					} else {
						const res = await fetch(url, {
							headers: {
								'User-Agent': 'Mozilla/5.0 (compatible; Scholio/1.0; +https://scholio.review)'
							},
							signal: AbortSignal.timeout(60_000)
						});
						if (!res.ok) throw new Error(`HTTP ${res.status}`);
						buffer = new Uint8Array(await res.arrayBuffer());
						log('downloaded', buffer.byteLength, 'bytes');
					}

					// Unzip
					const { unzipSync } = await import('fflate');
					const files = unzipSync(buffer);
					const decode = (b: Uint8Array) => new TextDecoder().decode(b);
					log('unzipped, files:', Object.keys(files).length);

					// Find OPF via META-INF/container.xml
					const containerXml = decode(files['META-INF/container.xml']);
					const { parseHTML } = await import('linkedom');
					const { document: containerDoc } = parseHTML(`<?xml version="1.0"?>${containerXml}`);
					const rootfilePath =
						containerDoc.querySelector('rootfile')?.getAttribute('full-path') ?? '';
					if (!rootfilePath) throw new Error('No rootfile in container.xml');
					log('rootfile:', rootfilePath);

					// Parse OPF
					const opfBase = rootfilePath.includes('/')
						? rootfilePath.slice(0, rootfilePath.lastIndexOf('/') + 1)
						: '';
					const opfXml = decode(files[rootfilePath]);
					const { document: opfDoc } = parseHTML(`<?xml version="1.0"?>${opfXml}`);

					// Metadata — use getElementsByTagName to avoid namespace selector issues
					const metaEl = (localName: string) =>
						opfDoc.getElementsByTagName(`dc:${localName}`)[0] ??
						opfDoc.getElementsByTagName(localName)[0] ??
						null;
					const title = metaEl('title')?.textContent?.trim() ?? 'Untitled';
					const creatorEl = metaEl('creator');
					const creatorText = creatorEl?.textContent?.trim() ?? '';
					const dateText = metaEl('date')?.textContent?.trim()?.slice(0, 4) ?? '';
					log('metadata:', { title, creatorText, dateText });

					// Parse author name: "Last, First" or "First Last"
					let authorFirst = '',
						authorLast = creatorText;
					if (creatorText.includes(',')) {
						const [last, first] = creatorText.split(',').map((s: string) => s.trim());
						authorLast = last;
						authorFirst = first ?? '';
					} else if (creatorText.includes(' ')) {
						const parts = creatorText.split(' ');
						authorFirst = parts.slice(0, -1).join(' ');
						authorLast = parts[parts.length - 1];
					}
					const authors = creatorText ? [{ first: authorFirst, last: authorLast }] : [];

					// Manifest: id → href map (getElementsByTagName avoids namespace issues)
					const manifestItems = new Map<string, string>();
					Array.from(opfDoc.getElementsByTagName('item')).forEach((item) => {
						const id = item.getAttribute('id');
						const href = item.getAttribute('href');
						const type = item.getAttribute('media-type') ?? '';
						if (id && href && (type.includes('html') || type.includes('xhtml'))) {
							manifestItems.set(id, href);
						}
					});
					log('manifest html items:', manifestItems.size);

					// Image manifest: id → href (for src rewriting)
					const imageItems = new Map<string, string>();
					Array.from(opfDoc.getElementsByTagName('item')).forEach((item) => {
						const id = item.getAttribute('id');
						const href = item.getAttribute('href');
						const type = item.getAttribute('media-type') ?? '';
						if (id && href && type.startsWith('image/')) {
							imageItems.set(id, href);
						}
					});

					// Spine: ordered chapter idrefs
					const spineItems: string[] = [];
					Array.from(opfDoc.getElementsByTagName('itemref')).forEach((ref) => {
						const idref = ref.getAttribute('idref');
						if (idref && manifestItems.has(idref)) spineItems.push(idref);
					});
					log('spine chapters:', spineItems.length);

					// Create bibliography reference
					const { generateCiteKey } = await import('$lib/utils/bibtex');
					const citeKey = generateCiteKey(
						authors.length ? authors : [{ first: '', last: 'unknown' }],
						dateText
					);

					const { default: createDOMPurify } = await import('dompurify');

					// Resolve S3 once for image uploads
					const s3 = await resolveProjectS3Config(projectId, ctx.user.id, ctx.withRLS).catch(
						() => null
					);

					// Normalize a relative path (resolve ".." segments)
					const normalizePath = (p: string) => {
						const parts = p.split('/');
						const out: string[] = [];
						for (const part of parts) {
							if (part === '..') out.pop();
							else if (part && part !== '.') out.push(part);
						}
						return out.join('/');
					};

					const imageExtMime: Record<string, string> = {
						jpg: 'image/jpeg',
						jpeg: 'image/jpeg',
						png: 'image/png',
						gif: 'image/gif',
						svg: 'image/svg+xml',
						webp: 'image/webp'
					};

					let resolvedRefId: string;

					if (providedReferenceId) {
						// User selected an existing reference — link it to the project and skip creation
						resolvedRefId = providedReferenceId;
						await ctx.withRLS((db) =>
							db
								.insert(projectReference)
								.values({ projectId, referenceId: resolvedRefId })
								.onConflictDoNothing()
						);
						log('using provided referenceId:', resolvedRefId);
					} else {
						// Auto-create reference from EPUB metadata
						const refId = crypto.randomUUID();
						await ctx.withRLS((db) =>
							db
								.insert(reference)
								.values({
									id: refId,
									userId: ctx.user.id,
									citeKey,
									type: 'book',
									title,
									authors,
									editors: [],
									year: dateText,
									url,
									abstract: '',
									journal: '',
									booktitle: '',
									publisher: '',
									doi: '',
									volume: '',
									issue: '',
									pages: '',
									extra: {}
								})
								.onConflictDoNothing()
						);

						// Resolve actual ref id (may have been skipped due to conflict on citeKey)
						const refs = await ctx.withRLS((db) =>
							db
								.select({ id: reference.id })
								.from(reference)
								.where(and(eq(reference.userId, ctx.user.id), eq(reference.citeKey, citeKey)))
								.limit(1)
						);
						resolvedRefId = refs[0]?.id ?? refId;

						await ctx.withRLS((db) =>
							db
								.insert(projectReference)
								.values({ projectId, referenceId: resolvedRefId })
								.onConflictDoNothing()
						);
						log('auto-created reference, citeKey:', citeKey, 'id:', resolvedRefId);
					}

					// Pre-load existing titles to disambiguate duplicates without retries
					const existingTitleRows = await ctx.withRLS((db) =>
						db
							.select({ title: document.title })
							.from(document)
							.where(eq(document.projectId, projectId))
					);
					const takenTitles = new Set(existingTitleRows.map((r) => r.title));

					function uniqueTitle(base: string): string {
						if (!takenTitles.has(base)) {
							takenTitles.add(base);
							return base;
						}
						let n = 2;
						while (takenTitles.has(`${base} (${n})`)) n++;
						const t = `${base} (${n})`;
						takenTitles.add(t);
						return t;
					}

					// Import each chapter in its own transaction so one failure doesn't block the rest
					for (let i = 0; i < spineItems.length; i++) {
						const idref = spineItems[i];
						const href = manifestItems.get(idref)!;
						const filePath = opfBase + href;
						const fileData = files[filePath] ?? files[href];
						log(
							`chapter ${i + 1}/${spineItems.length}: idref=${idref} href=${href} filePath=${filePath} found=${!!fileData}`
						);
						if (!fileData) continue;

						const chapterHtml = decode(fileData);
						const chapterDir = href.includes('/') ? href.slice(0, href.lastIndexOf('/') + 1) : '';

						// Parse chapter DOM for title + image rewriting
						const { document: chDoc, window: chWindow } = parseHTML(chapterHtml);

						// Rewrite image srcs to S3 URLs
						if (s3) {
							const imgEls = Array.from(chDoc.querySelectorAll('img'));
							log(`  chapter ${i + 1}: ${imgEls.length} images to rewrite`);
							for (const img of imgEls) {
								const src = img.getAttribute('src');
								if (
									!src ||
									src.startsWith('data:') ||
									src.startsWith('http://') ||
									src.startsWith('https://')
								)
									continue;
								const imgPath = normalizePath(opfBase + chapterDir + src);
								const imgData = files[imgPath] ?? files[normalizePath(opfBase + src)] ?? files[src];
								if (!imgData) {
									log(`  image not found in zip: ${imgPath}`);
									img.removeAttribute('src');
									continue;
								}
								const ext = src.split('.').pop()?.toLowerCase() ?? 'jpg';
								const mimeType = imageExtMime[ext] ?? 'image/jpeg';
								const s3Key = `projects/${projectId}/epub-images/${crypto.randomUUID()}.${ext}`;
								try {
									const s3Url = await uploadFileWithConfig(
										s3,
										s3Key,
										Buffer.from(imgData),
										mimeType
									);
									img.setAttribute('src', s3Url);
								} catch (e) {
									log(`  image upload failed: ${e}`);
									img.removeAttribute('src');
								}
							}
						}

						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						const purify = createDOMPurify(chWindow as any);
						const htmlToSanitize = chDoc.documentElement?.outerHTML ?? chapterHtml;
						const clean = purify.sanitize(htmlToSanitize, {
							ADD_TAGS: ['figure', 'figcaption'],
							ADD_ATTR: ['role']
						});
						const chapterTitle =
							chDoc.querySelector('h1, h2')?.textContent?.trim() ||
							chDoc.querySelector('title')?.textContent?.trim() ||
							`${title} — Chapter ${i + 1}`;

						const docTitle = uniqueTitle(chapterTitle.slice(0, 250));
						const docId = crypto.randomUUID();
						log(`  inserting chapter "${docTitle}"`);

						await ctx
							.withRLS((db) =>
								db.insert(document).values({
									id: docId,
									projectId,
									title: docTitle,
									type: 'chapter',
									ownerUserId: ctx.user.id,
									generatedByAi: false,
									isReadonly: true,
									renderedHtml: clean,
									sourceReferenceId: resolvedRefId
								})
							)
							.catch((e) => log(`  failed chapter "${docTitle}": ${e.message}`));
					}

					// Done — own transaction so it always succeeds
					await ctx.withRLS((db) =>
						db.update(project).set({ isImporting: false }).where(eq(project.id, projectId))
					);
					log('done', spineItems.length, 'chapters processed');
				} catch (err) {
					console.error('[importEpub] failed:', err);
					// Clear flag even on error so UI doesn't hang
					await ctx
						.withRLS((db) =>
							db.update(project).set({ isImporting: false }).where(eq(project.id, projectId))
						)
						.catch(console.error);
				}
			})();

			return { started: true };
		})
});
