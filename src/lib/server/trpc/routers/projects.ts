import { z } from 'zod';
import { eq, and, asc, ilike, or, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../init';
import {
	project,
	projectCollaborator,
	projectRoleEnum
} from '$lib/server/db/schemas/projects.schema';
import { document } from '$lib/server/db/schemas/documents.schema';
import { documentChunk } from '$lib/server/db/schemas/documentChunks.schema';
import { projectInterest } from '$lib/server/db/schemas/discover.schema';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { organization, organizationMember } from '$lib/server/db/schemas/organizations.schema';
import { user } from '$lib/server/db/auth.schema';
import { embedQuery } from '$lib/server/embeddings';

const projectStatusValues = ['draft', 'active', 'review', 'published', 'archived'] as const;

const createProjectSchema = z.object({
	title: z.string().min(1).max(255),
	description: z.string().max(2000).optional(),
	orgId: z.string().optional() // set when creating in an org workspace
});

const updateProjectSchema = z.object({
	id: z.string(),
	title: z.string().min(1).max(255).optional(),
	description: z.string().max(2000).nullable().optional(),
	notes: z.string().max(10000).nullable().optional(),
	status: z.enum(projectStatusValues).optional(),
	doi: z.string().max(255).nullable().optional(),
	version: z.string().max(50).nullable().optional(),
	publishedAt: z.coerce.date().nullable().optional()
});

export const projectsRouter = router({
	list: protectedProcedure.query(async ({ ctx }) => {
		return ctx.withRLS((db) =>
			db.select().from(project).orderBy(project.createdAt)
		);
	}),

	listForQuickNote: protectedProcedure.query(async ({ ctx }) => {
		return ctx.withRLS((db) =>
			db
				.select({ id: project.id, title: project.title })
				.from(project)
				.orderBy(asc(project.title))
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

	delete: protectedProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
		const rows = await ctx.withRLS((db) =>
			db.delete(project).where(eq(project.id, input)).returning({ id: project.id })
		);

		if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
		return rows[0];
	}),

	// Colaboradores del proyecto
	collaborators: protectedProcedure.input(z.string()).query(async ({ ctx, input }) => {
		return ctx.withRLS((db) =>
			db
				.select()
				.from(projectCollaborator)
				.where(eq(projectCollaborator.projectId, input))
		);
	}),

	myRole: protectedProcedure.input(z.string()).query(async ({ ctx, input }) => {
		const rows = await ctx.withRLS((db) =>
			db
				.select({ role: projectCollaborator.role })
				.from(projectCollaborator)
				.where(
					and(
						eq(projectCollaborator.projectId, input),
						eq(projectCollaborator.userId, ctx.user.id)
					)
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
			const proj = await ctx.db
				.select({ ownerId: project.ownerId })
				.from(project)
				.where(eq(project.id, input.projectId))
				.limit(1);

			if (!proj[0]) throw new TRPCError({ code: 'NOT_FOUND' });
			if (proj[0].ownerId !== ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN' });

			await ctx.db
				.delete(projectCollaborator)
				.where(
					and(
						eq(projectCollaborator.projectId, input.projectId),
						eq(projectCollaborator.userId, input.userId)
					)
				);
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
						1 - (dc.embedding <=> ${sql.raw(vecLiteral)}::vector) AS similarity
					FROM scholio.document_chunk dc
					JOIN scholio.document d ON d.id = dc.document_id AND d.title = 'Abstract'
					JOIN scholio.project p ON p.id = dc.project_id AND p.is_searchable = true
					JOIN "user" u ON u.id = p.owner_id
					LEFT JOIN scholio.user_profile up ON up.user_id = p.owner_id
					WHERE 1 - (dc.embedding <=> ${sql.raw(vecLiteral)}::vector) > 0.25
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
		if (proj[0].ownerId !== ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN' });

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
			const proj = await ctx.withRLS((db) =>
				db.select({ ownerId: project.ownerId }).from(project).where(eq(project.id, projectId)).limit(1)
			) as { ownerId: string }[];

			if (!proj[0]) throw new TRPCError({ code: 'NOT_FOUND' });
			if (proj[0].ownerId === ctx.user.id) {
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'El owner no puede abandonar su propio proyecto.' });
			}

			// ctx.db para el delete: RLS en projectCollaborator no tiene política de DELETE
			await ctx.db
				.delete(projectCollaborator)
				.where(
					and(
						eq(projectCollaborator.projectId, projectId),
						eq(projectCollaborator.userId, ctx.user.id)
					)
				);
		})
});
