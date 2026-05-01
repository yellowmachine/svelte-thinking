import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, publicProcedure } from '../init';
import { projectInvitation } from '$lib/server/db/schemas/invitations.schema';
import { projectCollaborator, project } from '$lib/server/db/schemas/projects.schema';
import { sendProjectInvitation } from '$lib/server/services/email.service';
import { user } from '$lib/server/db/auth.schema';
import { canInviteToProject, isSelfInvite } from '$lib/domain/permissions';
import { mapDbError } from '$lib/server/db/errors/map-db-error';

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
			db.select().from(projectInvitation).where(eq(projectInvitation.projectId, projectId))
		);
	}),

	create: protectedProcedure.input(createInvitationSchema).mutation(async ({ ctx, input }) => {
		return ctx.withRLS(async (db) => {
			// Verifica que el proyecto existe y el usuario es owner (RLS ya lo garantiza,
			// pero lo comprobamos explícitamente para dar un error claro)
			const projects = await db
				.select({ title: project.title, ownerId: project.ownerId })
				.from(project)
				.where(eq(project.id, input.projectId))
				.limit(1);

			if (!projects[0]) throw new TRPCError({ code: 'NOT_FOUND' });
			if (!canInviteToProject(ctx.user.id, projects[0].ownerId)) {
				throw new TRPCError({ code: 'FORBIDDEN' });
			}
			if (input.invitedEmail.toLowerCase() === ctx.user.email.toLowerCase()) {
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'No puedes invitarte a ti mismo' });
			}

			// Evita reinvitar a alguien que ya es colaborador
			const alreadyMember = await db
				.select({ id: projectCollaborator.id })
				.from(projectCollaborator)
				.innerJoin(user, eq(user.id, projectCollaborator.userId))
				.where(
					and(
						eq(projectCollaborator.projectId, input.projectId),
						eq(user.email, input.invitedEmail.toLowerCase())
					)
				)
				.limit(1);

			if (alreadyMember[0]) {
				throw new TRPCError({
					code: 'CONFLICT',
					message: 'This user is already a member of the project'
				});
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
					projectTitle: projects[0].title,
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

	// Pública — devuelve info de la invitación para la página de aceptación
	// No usa RLS: el token opaco es la autenticación
	byToken: publicProcedure.input(z.string()).query(async ({ ctx, input: token }) => {
		const rows = await ctx.db
			.select({
				id: projectInvitation.id,
				role: projectInvitation.role,
				status: projectInvitation.status,
				expiresAt: projectInvitation.expiresAt,
				projectId: projectInvitation.projectId,
				invitedEmail: projectInvitation.invitedEmail
			})
			.from(projectInvitation)
			.where(eq(projectInvitation.token, token))
			.limit(1);

		if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
		return rows[0];
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

		try {
			await ctx.db.insert(projectCollaborator).values({
				id: crypto.randomUUID(),
				projectId: invitation.projectId,
				userId: ctx.user.id,
				ownerUserId: invitation.invitedBy,
				role: invitation.role
			});
		} catch (err) {
			throw mapDbError(err, {
				entity: 'membership',
				operation: 'accept invitation',
				constraints: {
					project_collaborator_unique_idx: 'Ya eres colaborador de este proyecto'
				}
			});
		}

		await ctx.db
			.update(projectInvitation)
			.set({ status: 'accepted' })
			.where(eq(projectInvitation.id, invitation.id));

		return { projectId: invitation.projectId, role: invitation.role };
	}),

	// Invita directamente a un usuario existente (por userId, desde el perfil público)
	createForUserId: protectedProcedure
		.input(z.object({ projectId: z.string(), userId: z.string(), role: z.enum(roleValues) }))
		.mutation(async ({ ctx, input }) => {
			// Obtiene el email del usuario invitado (superuser — no hay RLS en auth.user)
			const targetUser = await ctx.db
				.select({ email: user.email, name: user.name })
				.from(user)
				.where(eq(user.id, input.userId))
				.limit(1);

			if (!targetUser[0]) throw new TRPCError({ code: 'NOT_FOUND' });
			if (isSelfInvite(ctx.user.id, input.userId)) {
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'No puedes invitarte a ti mismo' });
			}

			// Reutiliza el flujo de create con email
			return ctx.withRLS(async (db) => {
				const projects = await db
					.select({ title: project.title, ownerId: project.ownerId })
					.from(project)
					.where(eq(project.id, input.projectId))
					.limit(1);

				if (!projects[0]) throw new TRPCError({ code: 'NOT_FOUND' });
				if (!canInviteToProject(ctx.user.id, projects[0].ownerId))
					throw new TRPCError({ code: 'FORBIDDEN' });

				const existing = await db
					.select({ id: projectInvitation.id })
					.from(projectInvitation)
					.where(
						and(
							eq(projectInvitation.projectId, input.projectId),
							eq(projectInvitation.invitedEmail, targetUser[0].email),
							eq(projectInvitation.status, 'pending')
						)
					)
					.limit(1);

				if (existing[0]) {
					throw new TRPCError({
						code: 'CONFLICT',
						message: 'Ya existe una invitación pendiente para este usuario'
					});
				}

				const token = generateToken();

				const [invitation] = await db
					.insert(projectInvitation)
					.values({
						id: crypto.randomUUID(),
						projectId: input.projectId,
						projectTitle: projects[0].title,
						invitedEmail: targetUser[0].email,
						invitedBy: ctx.user.id,
						role: input.role,
						token,
						expiresAt: sevenDaysFromNow()
					})
					.returning();

				const origin = ctx.event.url.origin;
				sendProjectInvitation({
					to: targetUser[0].email,
					inviterName: ctx.user.name,
					projectTitle: projects[0].title,
					role: input.role,
					token,
					origin
				}).catch(console.error);

				return invitation;
			});
		}),

	cancel: protectedProcedure.input(z.string()).mutation(async ({ ctx, input: invitationId }) => {
		const rows = await ctx.withRLS((db) =>
			db
				.update(projectInvitation)
				.set({ status: 'cancelled' })
				.where(and(eq(projectInvitation.id, invitationId), eq(projectInvitation.status, 'pending')))
				.returning({ id: projectInvitation.id })
		);

		if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
		return rows[0];
	}),

	// El invitado rechaza la invitación — usa ctx.db (superuser) porque RLS no permite
	// al invitado modificar filas propias (solo el owner puede via RLS)
	decline: protectedProcedure.input(z.string()).mutation(async ({ ctx, input: invitationId }) => {
		const me = await ctx.db
			.select({ email: user.email })
			.from(user)
			.where(eq(user.id, ctx.user.id))
			.limit(1);

		if (!me[0]) throw new TRPCError({ code: 'UNAUTHORIZED' });

		const rows = await ctx.db
			.update(projectInvitation)
			.set({ status: 'cancelled' })
			.where(
				and(
					eq(projectInvitation.id, invitationId),
					eq(projectInvitation.invitedEmail, me[0].email),
					eq(projectInvitation.status, 'pending')
				)
			)
			.returning({ id: projectInvitation.id });

		if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
		return rows[0];
	})
});
