import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, publicProcedure } from '../init';
import { projectInvitation } from '$lib/server/db/schemas/invitations.schema';
import { projectCollaborator, project } from '$lib/server/db/schemas/projects.schema';
import { sendProjectInvitation } from '$lib/server/services/email.service';

const roleValues = ['author', 'coauthor', 'reviewer', 'commenter'] as const;

const createInvitationSchema = z.object({
	projectId: z.string(),
	invitedEmail: z.string().email(),
	role: z.enum(roleValues)
});

function generateToken() {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

function sevenDaysFromNow() {
	const d = new Date();
	d.setDate(d.getDate() + 7);
	return d;
}

export const invitationsRouter = router({
	// Invitaciones de un proyecto (solo visible para el owner, RLS filtra)
	list: protectedProcedure.input(z.string()).query(async ({ ctx, input: projectId }) => {
		return ctx.withRLS((db) =>
			db
				.select()
				.from(projectInvitation)
				.where(eq(projectInvitation.projectId, projectId))
		);
	}),

	create: protectedProcedure
		.input(createInvitationSchema)
		.mutation(async ({ ctx, input }) => {
			return ctx.withRLS(async (db) => {
				// Verifica que el proyecto existe y el usuario es owner (RLS ya lo garantiza,
				// pero lo comprobamos explícitamente para dar un error claro)
				const projects = await db
					.select({ title: project.title, ownerId: project.ownerId })
					.from(project)
					.where(eq(project.id, input.projectId))
					.limit(1);

				if (!projects[0]) throw new TRPCError({ code: 'NOT_FOUND' });
				if (projects[0].ownerId !== ctx.user.id) {
					throw new TRPCError({ code: 'FORBIDDEN' });
				}

				// Evita duplicados de invitaciones pendientes
				const existing = await db
					.select({ id: projectInvitation.id })
					.from(projectInvitation)
					.where(
						and(
							eq(projectInvitation.projectId, input.projectId),
							eq(projectInvitation.invitedEmail, input.invitedEmail),
							eq(projectInvitation.status, 'pending')
						)
					)
					.limit(1);

				if (existing[0]) {
					throw new TRPCError({
						code: 'CONFLICT',
						message: 'Ya existe una invitación pendiente para este email'
					});
				}

				const token = generateToken();

				const [invitation] = await db
					.insert(projectInvitation)
					.values({
						id: crypto.randomUUID(),
						projectId: input.projectId,
						invitedEmail: input.invitedEmail,
						invitedBy: ctx.user.id,
						role: input.role,
						token,
						expiresAt: sevenDaysFromNow()
					})
					.returning();

				// Envía el email (no bloquea si falla — la invitación ya está en DB)
				const origin = ctx.event.url.origin;
				sendProjectInvitation({
					to: input.invitedEmail,
					inviterName: ctx.user.name,
					projectTitle: projects[0].title,
					role: input.role,
					token,
					origin
				}).catch(console.error);

				return invitation;
			});
		}),

	// Ruta pública — devuelve info de la invitación para mostrar en la página de aceptación
	byToken: publicProcedure.input(z.string()).query(async ({ ctx }) => {
		// No usa RLS porque es pública — la validación es el token opaco
		throw new TRPCError({ code: 'METHOD_NOT_SUPPORTED' });
	}),

	// Acepta la invitación por token (el usuario ya debe estar autenticado)
	accept: protectedProcedure.input(z.string()).mutation(async ({ ctx, input: token }) => {
		// Esta operación mezcla contextos: lee la invitación sin RLS (token es la auth),
		// luego crea el colaborador con RLS del nuevo usuario
		const invitations = await ctx.db
			.select()
			.from(projectInvitation)
			.where(and(eq(projectInvitation.token, token), eq(projectInvitation.status, 'pending')))
			.limit(1);

		const invitation = invitations[0];

		if (!invitation) {
			throw new TRPCError({ code: 'NOT_FOUND', message: 'Invitación no válida o expirada' });
		}

		if (invitation.expiresAt < new Date()) {
			await ctx.db
				.update(projectInvitation)
				.set({ status: 'expired' })
				.where(eq(projectInvitation.id, invitation.id));

			throw new TRPCError({ code: 'BAD_REQUEST', message: 'La invitación ha expirado' });
		}

		// Verifica que no sea ya colaborador
		const alreadyCollaborator = await ctx.db
			.select({ id: projectCollaborator.id })
			.from(projectCollaborator)
			.where(
				and(
					eq(projectCollaborator.projectId, invitation.projectId),
					eq(projectCollaborator.userId, ctx.user.id)
				)
			)
			.limit(1);

		if (alreadyCollaborator[0]) {
			throw new TRPCError({ code: 'CONFLICT', message: 'Ya eres colaborador de este proyecto' });
		}

		await ctx.db.insert(projectCollaborator).values({
			id: crypto.randomUUID(),
			projectId: invitation.projectId,
			userId: ctx.user.id,
			role: invitation.role
		});

		await ctx.db
			.update(projectInvitation)
			.set({ status: 'accepted' })
			.where(eq(projectInvitation.id, invitation.id));

		return { projectId: invitation.projectId, role: invitation.role };
	}),

	cancel: protectedProcedure.input(z.string()).mutation(async ({ ctx, input: invitationId }) => {
		const rows = await ctx.withRLS((db) =>
			db
				.update(projectInvitation)
				.set({ status: 'cancelled' })
				.where(
					and(
						eq(projectInvitation.id, invitationId),
						eq(projectInvitation.status, 'pending')
					)
				)
				.returning({ id: projectInvitation.id })
		);

		if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
		return rows[0];
	})
});
