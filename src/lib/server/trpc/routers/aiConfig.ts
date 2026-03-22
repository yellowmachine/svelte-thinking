import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../init';
import { userAiConfig, userProfile } from '$lib/server/db/schemas/users.schema';
import { encryptSecret } from '$lib/server/kms';

const PROVIDER = z.enum(['openrouter', 'perplexity']);

// Curated model lists shown in the UI model selector.
const MODELS: Record<string, { id: string; label: string }[]> = {
	openrouter: [
		{ id: 'anthropic/claude-haiku-4-5', label: 'Claude Haiku 4.5 (fast)' },
		{ id: 'anthropic/claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
		{ id: 'openai/gpt-4o-mini', label: 'GPT-4o mini (fast)' },
		{ id: 'openai/gpt-4o', label: 'GPT-4o' },
		{ id: 'google/gemini-flash-1.5', label: 'Gemini Flash 1.5 (fast)' },
		{ id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B' }
	],
	perplexity: [
		{ id: 'sonar', label: 'Sonar (fast)' },
		{ id: 'sonar-pro', label: 'Sonar Pro' },
		{ id: 'sonar-reasoning-pro', label: 'Sonar Reasoning Pro' },
		{ id: 'sonar-deep-research', label: 'Sonar Deep Research' }
	]
};

export const aiConfigRouter = router({
	// Returns all configured providers + current default from userProfile.
	// Never returns any key material.
	getStatus: protectedProcedure.query(async ({ ctx }) => {
		const [configs, profileRows] = await Promise.all([
			ctx.withRLS((db) =>
				db
					.select({
						provider: userAiConfig.provider,
						model: userAiConfig.model,
						enabled: userAiConfig.enabled,
						updatedAt: userAiConfig.updatedAt
					})
					.from(userAiConfig)
					.where(eq(userAiConfig.userId, ctx.user.id))
			) as Promise<{ provider: string; model: string | null; enabled: boolean; updatedAt: Date }[]>,

			ctx.withRLS((db) =>
				db
					.select({
						defaultAiProvider: userProfile.defaultAiProvider,
						defaultAiModel: userProfile.defaultAiModel
					})
					.from(userProfile)
					.where(eq(userProfile.userId, ctx.user.id))
					.limit(1)
			) as Promise<{ defaultAiProvider: string | null; defaultAiModel: string | null }[]>
		]);

		return {
			providers: configs,
			defaultProvider: profileRows[0]?.defaultAiProvider ?? 'openrouter',
			defaultModel: profileRows[0]?.defaultAiModel ?? null
		};
	}),

	// Static curated model list for a given provider — no API call needed.
	getModels: protectedProcedure
		.input(z.object({ provider: PROVIDER }))
		.query(({ input }) => {
			return { models: MODELS[input.provider] ?? [] };
		}),

	// Encrypts and stores (or replaces) the user's API key for the given provider.
	saveApiKey: protectedProcedure
		.input(
			z.object({
				provider: PROVIDER,
				apiKey: z.string().min(1),
				model: z.string().optional()
			})
		)
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
					.where(
						and(
							eq(userAiConfig.userId, ctx.user.id),
							eq(userAiConfig.provider, input.provider)
						)
					)
					.limit(1)
			)) as { id: string }[];

			if (existing[0]) {
				await ctx.withRLS((db) =>
					db
						.update(userAiConfig)
						.set({
							...encrypted,
							...(input.model !== undefined ? { model: input.model } : {}),
							enabled: true,
							updatedAt: new Date()
						})
						.where(
							and(
								eq(userAiConfig.userId, ctx.user.id),
								eq(userAiConfig.provider, input.provider)
							)
						)
				);
			} else {
				await ctx.withRLS((db) =>
					db.insert(userAiConfig).values({
						id: crypto.randomUUID(),
						userId: ctx.user.id,
						provider: input.provider,
						model: input.model ?? null,
						...encrypted,
						enabled: true
					})
				);
			}

			return { ok: true };
		}),

	// Enables or disables the assistant for a specific provider without deleting the key.
	toggleEnabled: protectedProcedure
		.input(z.object({ provider: PROVIDER, enabled: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			const rows = (await ctx.withRLS((db) =>
				db
					.select({ id: userAiConfig.id })
					.from(userAiConfig)
					.where(
						and(
							eq(userAiConfig.userId, ctx.user.id),
							eq(userAiConfig.provider, input.provider)
						)
					)
					.limit(1)
			)) as { id: string }[];

			if (!rows[0])
				throw new TRPCError({ code: 'NOT_FOUND', message: 'No hay API key configurada para este proveedor.' });

			await ctx.withRLS((db) =>
				db
					.update(userAiConfig)
					.set({ enabled: input.enabled, updatedAt: new Date() })
					.where(
						and(
							eq(userAiConfig.userId, ctx.user.id),
							eq(userAiConfig.provider, input.provider)
						)
					)
			);

			return { enabled: input.enabled };
		}),

	// Permanently removes the stored key for a specific provider.
	deleteApiKey: protectedProcedure
		.input(z.object({ provider: PROVIDER }))
		.mutation(async ({ ctx, input }) => {
			await ctx.withRLS((db) =>
				db
					.delete(userAiConfig)
					.where(
						and(
							eq(userAiConfig.userId, ctx.user.id),
							eq(userAiConfig.provider, input.provider)
						)
					)
			);
			return { ok: true };
		}),

	// Sets the default provider and optionally the default model.
	setDefault: protectedProcedure
		.input(
			z.object({
				provider: PROVIDER,
				model: z.string().nullable().optional()
			})
		)
		.mutation(async ({ ctx, input }) => {
			await ctx.withRLS((db) =>
				db
					.update(userProfile)
					.set({
						defaultAiProvider: input.provider,
						...(input.model !== undefined ? { defaultAiModel: input.model } : {}),
						updatedAt: new Date()
					})
					.where(eq(userProfile.userId, ctx.user.id))
			);
			return { ok: true };
		}),

	// Updates just the model for a provider config (without re-saving the key).
	setModel: protectedProcedure
		.input(z.object({ provider: PROVIDER, model: z.string().nullable() }))
		.mutation(async ({ ctx, input }) => {
			await ctx.withRLS((db) =>
				db
					.update(userAiConfig)
					.set({ model: input.model, updatedAt: new Date() })
					.where(
						and(
							eq(userAiConfig.userId, ctx.user.id),
							eq(userAiConfig.provider, input.provider)
						)
					)
			);
			return { ok: true };
		})
});
