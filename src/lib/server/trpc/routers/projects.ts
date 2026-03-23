import { z } from 'zod';
import { eq, and, or, exists, asc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../init';
import {
	project,
	projectCollaborator,
	projectRoleEnum
} from '$lib/server/db/schemas/projects.schema';

const projectStatusValues = ['draft', 'active', 'review', 'published', 'archived'] as const;

const createProjectSchema = z.object({
	title: z.string().min(1).max(255),
	description: z.string().max(2000).optional()
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

		return ctx.withRLS(async (db) => {
			const [created] = await db
				.insert(project)
				.values({
					id,
					title: input.title,
					description: input.description,
					ownerId: userId
				})
				.returning();

			// El owner también se registra como colaborador para simplificar queries de permisos
			await db.insert(projectCollaborator).values({
				id: crypto.randomUUID(),
				projectId: id,
				userId,
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
