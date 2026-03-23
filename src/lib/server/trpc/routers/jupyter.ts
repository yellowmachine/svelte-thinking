import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../init';
import { userJupyterConnection } from '$lib/server/db/schemas/users.schema';
import { encryptSecret } from '$lib/server/kms';

export const jupyterRouter = router({
	// Lists the user's Jupyter connections — never returns token material.
	list: protectedProcedure.query(async ({ ctx }) => {
		return ctx.withRLS((db) =>
			db
				.select({
					id: userJupyterConnection.id,
					name: userJupyterConnection.name,
					baseUrl: userJupyterConnection.baseUrl,
					createdAt: userJupyterConnection.createdAt
				})
				.from(userJupyterConnection)
				.where(eq(userJupyterConnection.userId, ctx.user.id))
		);
	}),

	// Adds a new Jupyter connection, encrypting the token via KMS.
	add: protectedProcedure
		.input(
			z.object({
				name: z.string().min(1).max(100),
				baseUrl: z.string().url(),
				token: z.string().min(1)
			})
		)
		.mutation(async ({ ctx, input }) => {
			// Normalise: strip trailing slash
			const baseUrl = input.baseUrl.replace(/\/$/, '');

			let encrypted;
			try {
				encrypted = await encryptSecret(input.token);
			} catch {
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'Could not encrypt token. Check AWS KMS configuration.'
				});
			}

			const [row] = await ctx.withRLS((db) =>
				db
					.insert(userJupyterConnection)
					.values({
						id: crypto.randomUUID(),
						userId: ctx.user.id,
						name: input.name,
						baseUrl,
						encryptedToken: encrypted.encryptedApiKey,
						encryptedDataKey: encrypted.encryptedDataKey,
						iv: encrypted.iv,
						authTag: encrypted.authTag
					})
					.returning({
						id: userJupyterConnection.id,
						name: userJupyterConnection.name,
						baseUrl: userJupyterConnection.baseUrl,
						createdAt: userJupyterConnection.createdAt
					})
			);

			return row;
		}),

	// Removes a connection by id. RLS ensures the user can only delete their own.
	remove: protectedProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const deleted = await ctx.withRLS((db) =>
				db
					.delete(userJupyterConnection)
					.where(
						and(
							eq(userJupyterConnection.id, input.id),
							eq(userJupyterConnection.userId, ctx.user.id)
						)
					)
					.returning({ id: userJupyterConnection.id })
			);

			if (!deleted.length) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Connection not found.' });
			}

			return { ok: true };
		})
});
