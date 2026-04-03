import { z } from 'zod';
import { eq, and, ne, count, max, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../init';
import { userProfile, userSpellAllowlist } from '$lib/server/db/schemas/users.schema';
import { user } from '$lib/server/db/auth.schema';
import { projectCollaborator, project } from '$lib/server/db/schemas/projects.schema';
import { documentVersion } from '$lib/server/db/schemas/documents.schema';
import { buildProfileText, indexUserProfile, embedQuery } from '$lib/server/embeddings';

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
	// Perfil público + stats de reputación (señal de selección para owners)
	publicProfile: protectedProcedure.input(z.string()).query(async ({ ctx, input: userId }) => {
		const [profileRows, collabRows, commitRows] = await Promise.all([
			ctx.db
				.select({
					userId: user.id,
					name: user.name,
					displayName: userProfile.displayName,
					bio: userProfile.bio,
					institution: userProfile.institution,
					orcid: userProfile.orcid
				})
				.from(user)
				.leftJoin(userProfile, eq(userProfile.userId, user.id))
				.where(eq(user.id, userId))
				.limit(1),

			ctx.db
				.select({ role: projectCollaborator.role, status: project.status })
				.from(projectCollaborator)
				.innerJoin(project, eq(project.id, projectCollaborator.projectId))
				.where(
					and(eq(projectCollaborator.userId, userId), ne(projectCollaborator.role, 'owner'))
				),

			ctx.db
				.select({ total: count(), lastAt: max(documentVersion.createdAt) })
				.from(documentVersion)
				.where(eq(documentVersion.createdBy, userId))
		]);

		if (!profileRows[0]) throw new TRPCError({ code: 'NOT_FOUND' });

		return {
			...profileRows[0],
			reputation: {
				projectsTotal: collabRows.length,
				projectsCompleted: collabRows.filter(
					(r) => r.status === 'published' || r.status === 'archived'
				).length,
				rolesWorked: [...new Set(collabRows.map((r) => r.role))],
				totalCommits: commitRows[0]?.total ?? 0,
				lastActiveAt: commitRows[0]?.lastAt ?? null
			}
		};
	}),

	// Búsqueda semántica de investigadores por perfil académico
	searchProfiles: protectedProcedure
		.input(z.string().min(1).max(200))
		.query(async ({ ctx, input: query }) => {
			const embedding = await embedQuery(query);
			const vecLiteral = `[${embedding.join(',')}]`;

			// Búsqueda por similitud coseno sobre profile_embedding
			// Filtra perfiles con embedding indexado y similarity > 0.35
			const rows = await ctx.db.execute(sql`
				SELECT
					u.id           AS user_id,
					u.name         AS name,
					up.display_name,
					up.institution,
					up.orcid,
					up.bio,
					1 - (up.profile_embedding <=> ${sql.raw(vecLiteral)}::vector) AS similarity
				FROM scholio.user_profile up
				JOIN "user" u ON u.id = up.user_id
				WHERE up.profile_embedding IS NOT NULL
				  AND 1 - (up.profile_embedding <=> ${sql.raw(vecLiteral)}::vector) > 0.35
				ORDER BY similarity DESC
				LIMIT 20
			`);

			return rows as unknown as Array<{
				user_id: string;
				name: string;
				display_name: string | null;
				institution: string | null;
				orcid: string | null;
				bio: string | null;
				similarity: number;
			}>;
		}),

	me: protectedProcedure.query(async ({ ctx }) => {
		return ctx.withRLS(async (db) => {
			const profiles = await db
				.select()
				.from(userProfile)
				.where(eq(userProfile.userId, ctx.user.id))
				.limit(1);

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

	setTheme: protectedProcedure
		.input(z.enum(['warm', 'github', 'solarized', 'nord', 'catppuccin', 'gruvbox']))
		.mutation(async ({ ctx, input: theme }) => {
			return ctx.withRLS((db) =>
				db
					.update(userProfile)
					.set({ theme, updatedAt: new Date() })
					.where(eq(userProfile.userId, ctx.user.id))
			);
		}),

	updateProfile: protectedProcedure
		.input(updateProfileSchema)
		.mutation(async ({ ctx, input }) => {
			return ctx.withRLS(async (db) => {
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

					const profileText = buildProfileText({
						displayName: created.displayName,
						institution: created.institution,
						bio: created.bio
					});
					indexUserProfile(ctx.db, ctx.user.id, profileText).catch(console.error);

					return created;
				}

				const updateData: Record<string, unknown> = { ...input, updatedAt: new Date() };
				// Si el ORCID se edita manualmente, pierde la verificación OAuth
				if ('orcid' in input) updateData.orcidVerified = false;

				const [updated] = await db
					.update(userProfile)
					.set(updateData)
					.where(eq(userProfile.userId, ctx.user.id))
					.returning();

				// Re-indexar embedding (fire-and-forget)
				const profileText = buildProfileText({
					displayName: updated.displayName,
					institution: updated.institution,
					bio: updated.bio
				});
				indexUserProfile(ctx.db, ctx.user.id, profileText).catch(console.error);

				return updated;
			});
		}),

	getSpellAllowlist: protectedProcedure.query(async ({ ctx }) => {
		const rows = await ctx.withRLS((db) =>
			db.select({ word: userSpellAllowlist.word })
				.from(userSpellAllowlist)
				.where(eq(userSpellAllowlist.userId, ctx.user.id))
		) as { word: string }[];
		return rows.map((r) => r.word);
	}),

	addSpellAllowlist: protectedProcedure
		.input(z.object({ word: z.string().min(1).max(100) }))
		.mutation(async ({ ctx, input }) => {
			const word = input.word.toLowerCase().trim();
			await ctx.withRLS((db) =>
				db.insert(userSpellAllowlist)
					.values({ userId: ctx.user.id, word })
					.onConflictDoNothing()
			);
			return { word };
		}),

	removeSpellAllowlist: protectedProcedure
		.input(z.object({ word: z.string() }))
		.mutation(async ({ ctx, input }) => {
			await ctx.withRLS((db) =>
				db.delete(userSpellAllowlist)
					.where(
						and(
							eq(userSpellAllowlist.userId, ctx.user.id),
							eq(userSpellAllowlist.word, input.word.toLowerCase())
						)
					)
			);
			return { ok: true };
		})
});
