import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../init';
import { userAiConfig } from '$lib/server/db/schemas/users.schema';
import { encryptSecret } from '$lib/server/kms';

export const aiConfigRouter = router({
	// Returns whether the user has a key configured and whether it's enabled.
	// Never returns the key itself.
	getStatus: protectedProcedure.query(async ({ ctx }) => {
		const rows = (await ctx.withRLS((db) =>
			db
				.select({
					provider: userAiConfig.provider,
					enabled: userAiConfig.enabled,
					updatedAt: userAiConfig.updatedAt
				})
				.from(userAiConfig)
				.where(eq(userAiConfig.userId, ctx.user.id))
				.limit(1)
		)) as { provider: string; enabled: boolean; updatedAt: Date }[];

		if (!rows[0]) return { configured: false, enabled: false, provider: null, updatedAt: null };
		return { configured: true, ...rows[0] };
	}),

	// Encrypts and stores (or replaces) the user's API key via KMS envelope encryption.
	saveApiKey: protectedProcedure
		.input(z.object({ apiKey: z.string().min(1), provider: z.enum(['openrouter']) }))
		.mutation(async ({ ctx, input }) => {
			let encrypted;
			try {
				encrypted = await encryptSecret(input.apiKey);
			} catch {
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'Error al cifrar la API key. Comprueba la configuración de AWS KMS.'
				});
			}

			const existing = (await ctx.withRLS((db) =>
				db
					.select({ id: userAiConfig.id })
					.from(userAiConfig)
					.where(eq(userAiConfig.userId, ctx.user.id))
					.limit(1)
			)) as { id: string }[];

			if (existing[0]) {
				await ctx.withRLS((db) =>
					db
						.update(userAiConfig)
						.set({ ...encrypted, provider: input.provider, enabled: true, updatedAt: new Date() })
						.where(eq(userAiConfig.userId, ctx.user.id))
				);
			} else {
				await ctx.withRLS((db) =>
					db.insert(userAiConfig).values({
						id: crypto.randomUUID(),
						userId: ctx.user.id,
						provider: input.provider,
						...encrypted,
						enabled: true
					})
				);
			}

			return { ok: true };
		}),

	// Enables or disables the AI assistant without deleting the key.
	toggleEnabled: protectedProcedure
		.input(z.boolean())
		.mutation(async ({ ctx, input: enabled }) => {
			const rows = (await ctx.withRLS((db) =>
				db
					.select({ id: userAiConfig.id })
					.from(userAiConfig)
					.where(eq(userAiConfig.userId, ctx.user.id))
					.limit(1)
			)) as { id: string }[];

			if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'No hay API key configurada.' });

			await ctx.withRLS((db) =>
				db
					.update(userAiConfig)
					.set({ enabled, updatedAt: new Date() })
					.where(eq(userAiConfig.userId, ctx.user.id))
			);

			return { enabled };
		}),

	// Permanently removes the stored key.
	deleteApiKey: protectedProcedure.mutation(async ({ ctx }) => {
		await ctx.withRLS((db) =>
			db.delete(userAiConfig).where(eq(userAiConfig.userId, ctx.user.id))
		);
		return { ok: true };
	})
});
