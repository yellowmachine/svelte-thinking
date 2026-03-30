import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../init';
import { userS3Config } from '$lib/server/db/schemas/users.schema';
import { encryptSecret } from '$lib/server/kms';
import { testS3Connection } from '$lib/server/storage';
import { getDecryptedS3Config } from '$lib/server/userStorage';

export const s3ConfigRouter = router({
	// Get current config (no credentials returned)
	get: protectedProcedure.query(async ({ ctx }) => {
		const [row] = await ctx.withRLS((db) =>
			db
				.select({
					endpoint: userS3Config.endpoint,
					bucket: userS3Config.bucket,
					region: userS3Config.region,
					publicUrl: userS3Config.publicUrl,
					verified: userS3Config.verified,
					createdAt: userS3Config.createdAt
				})
				.from(userS3Config)
				.where(eq(userS3Config.userId, ctx.user.id))
				.limit(1)
		) as { endpoint: string; bucket: string; region: string; publicUrl: string | null; verified: boolean; createdAt: Date }[];

		return row ?? null;
	}),

	// Save or update config (upsert)
	set: protectedProcedure
		.input(z.object({
			endpoint: z.string().url(),
			bucket: z.string().min(1).max(63),
			region: z.string().min(1).max(40).default('us-east-1'),
			publicUrl: z.string().url().optional(),
			accessKey: z.string().min(1),
			secretKey: z.string().min(1)
		}))
		.mutation(async ({ ctx, input }) => {
			let encrypted;
			try {
				encrypted = await encryptSecret(JSON.stringify({ accessKey: input.accessKey, secretKey: input.secretKey }));
			} catch {
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'Error al cifrar las credenciales. Comprueba la configuración de AWS KMS.'
				});
			}

			const { encryptedApiKey: encryptedCredentials, encryptedDataKey, iv, authTag } = encrypted;

			const existing = await ctx.withRLS((db) =>
				db.select({ id: userS3Config.id }).from(userS3Config).where(eq(userS3Config.userId, ctx.user.id)).limit(1)
			) as { id: string }[];

			if (existing.length > 0) {
				await ctx.withRLS((db) =>
					db.update(userS3Config).set({
						endpoint: input.endpoint,
						bucket: input.bucket,
						region: input.region,
						publicUrl: input.publicUrl ?? null,
						encryptedCredentials,
						encryptedDataKey,
						iv,
						authTag,
						verified: false,
						updatedAt: new Date()
					}).where(eq(userS3Config.userId, ctx.user.id))
				);
			} else {
				await ctx.withRLS((db) =>
					db.insert(userS3Config).values({
						id: crypto.randomUUID(),
						userId: ctx.user.id,
						endpoint: input.endpoint,
						bucket: input.bucket,
						region: input.region,
						publicUrl: input.publicUrl ?? null,
						encryptedCredentials,
						encryptedDataKey,
						iv,
						authTag,
						verified: false
					})
				);
			}

			return { ok: true };
		}),

	// Test connection and mark as verified
	test: protectedProcedure.mutation(async ({ ctx }) => {
		const config = await getDecryptedS3Config(ctx.user.id, ctx.withRLS);
		if (!config) {
			throw new TRPCError({ code: 'NOT_FOUND', message: 'S3 no configurado' });
		}

		const result = await testS3Connection(config);

		if (result.ok) {
			await ctx.withRLS((db) =>
				db.update(userS3Config).set({ verified: true, updatedAt: new Date() }).where(eq(userS3Config.userId, ctx.user.id))
			);
		}

		return result;
	}),

	// Remove config
	remove: protectedProcedure.mutation(async ({ ctx }) => {
		await ctx.withRLS((db) =>
			db.delete(userS3Config).where(eq(userS3Config.userId, ctx.user.id))
		);
		return { ok: true };
	})
});
