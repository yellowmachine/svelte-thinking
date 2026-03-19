import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { router, protectedProcedure } from '../init';
import { userProfile } from '$lib/server/db/schemas/users.schema';

const updateProfileSchema = z.object({
	displayName: z.string().min(1).max(100).optional(),
	bio: z.string().max(500).nullable().optional(),
	institution: z.string().max(200).nullable().optional(),
	orcid: z
		.string()
		.regex(/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/, 'Formato ORCID inválido (ej: 0000-0002-1825-0097)')
		.nullable()
		.optional()
});

export const usersRouter = router({
	me: protectedProcedure.query(async ({ ctx }) => {
		return ctx.withRLS(async (db) => {
			const profiles = await db
				.select()
				.from(userProfile)
				.where(eq(userProfile.userId, ctx.user.id))
				.limit(1);

			// Si no existe perfil aún, lo crea automáticamente
			if (!profiles[0]) {
				const [created] = await db
					.insert(userProfile)
					.values({
						id: crypto.randomUUID(),
						userId: ctx.user.id,
						displayName: ctx.user.name
					})
					.returning();
				return created;
			}

			return profiles[0];
		});
	}),

	updateProfile: protectedProcedure
		.input(updateProfileSchema)
		.mutation(async ({ ctx, input }) => {
			return ctx.withRLS(async (db) => {
				// Upsert: crea si no existe, actualiza si existe
				const existing = await db
					.select({ id: userProfile.id })
					.from(userProfile)
					.where(eq(userProfile.userId, ctx.user.id))
					.limit(1);

				if (!existing[0]) {
					const [created] = await db
						.insert(userProfile)
						.values({
							id: crypto.randomUUID(),
							userId: ctx.user.id,
							displayName: input.displayName ?? ctx.user.name,
							bio: input.bio,
							institution: input.institution,
							orcid: input.orcid
						})
						.returning();
					return created;
				}

				const [updated] = await db
					.update(userProfile)
					.set({ ...input, updatedAt: new Date() })
					.where(eq(userProfile.userId, ctx.user.id))
					.returning();

				return updated;
			});
		})
});
