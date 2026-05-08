import { z } from 'zod';
import { eq, asc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../init';
import { userApiKey, userProfile } from '$lib/server/db/schemas/users.schema';
import { encryptSecret } from '$lib/server/kms';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { AiTask, TaskConfig, AiTaskConfig } from '$lib/ai-config';
export {
	AI_TASKS,
	MODELS,
	TOOL_CALLING_MODELS,
	parseTaskConfig,
	getDefaultModel
} from '$lib/ai-config';
import type { AiTask } from '$lib/ai-config';
import { AI_TASKS, MODELS, parseTaskConfig } from '$lib/ai-config';

// ---------------------------------------------------------------------------
// OpenRouter pricing (fetched at runtime, cached in memory for 1 hour)
// ---------------------------------------------------------------------------

interface PricingCache {
	fetchedAt: number;
	prices: Record<string, { input: number; output: number }>;
}

let pricingCache: PricingCache | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function fetchOpenRouterPrices(): Promise<
	Record<string, { input: number; output: number }>
> {
	if (pricingCache && Date.now() - pricingCache.fetchedAt < CACHE_TTL_MS) {
		return pricingCache.prices;
	}

	try {
		const res = await fetch('https://openrouter.ai/api/v1/models', {
			headers: { 'User-Agent': 'Scholio/1.0' }
		});
		if (!res.ok) return pricingCache?.prices ?? {};

		const data = (await res.json()) as {
			data: { id: string; pricing?: { prompt?: string; completion?: string } }[];
		};

		const prices: Record<string, { input: number; output: number }> = {};
		for (const model of data.data) {
			const input = parseFloat(model.pricing?.prompt ?? '0');
			const output = parseFloat(model.pricing?.completion ?? '0');
			if (!isNaN(input) && !isNaN(output)) {
				prices[model.id] = { input, output };
			}
		}

		pricingCache = { fetchedAt: Date.now(), prices };
		return prices;
	} catch {
		return pricingCache?.prices ?? {};
	}
}

function formatPrice(pricePerToken: number): string {
	const perMillion = pricePerToken * 1_000_000;
	if (perMillion === 0) return 'free';
	if (perMillion < 0.01) return `$${(perMillion * 1000).toFixed(2)}/1B`;
	if (perMillion < 1) return `$${perMillion.toFixed(3)}/1M`;
	return `$${perMillion.toFixed(2)}/1M`;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const aiConfigRouter = router({
	// Returns model list with live pricing from OpenRouter (cached 1h)
	getModels: protectedProcedure.query(async () => {
		const prices = await fetchOpenRouterPrices();
		return MODELS.map((m) => {
			const p = prices[m.id];
			const pricing = p ? `${formatPrice(p.input)} in · ${formatPrice(p.output)} out` : null;
			return { ...m, pricing };
		});
	}),

	// List all keys for the current user (no key material returned)
	listKeys: protectedProcedure.query(async ({ ctx }) => {
		const keys = (await ctx.withRLS((db) =>
			db
				.select({
					id: userApiKey.id,
					name: userApiKey.name,
					enabled: userApiKey.enabled,
					source: userApiKey.source,
					createdAt: userApiKey.createdAt,
					updatedAt: userApiKey.updatedAt
				})
				.from(userApiKey)
				.where(eq(userApiKey.userId, ctx.user.id))
				.orderBy(asc(userApiKey.createdAt))
		)) as {
			id: string;
			name: string;
			enabled: boolean;
			source: string;
			createdAt: Date;
			updatedAt: Date;
		}[];

		return keys;
	}),

	// Get the task config (which key + model per task)
	getTaskConfig: protectedProcedure.query(async ({ ctx }) => {
		const rows = (await ctx.withRLS((db) =>
			db
				.select({ aiTaskConfig: userProfile.aiTaskConfig })
				.from(userProfile)
				.where(eq(userProfile.userId, ctx.user.id))
				.limit(1)
		)) as { aiTaskConfig: string | null }[];

		return {
			taskConfig: parseTaskConfig(rows[0]?.aiTaskConfig ?? null),
			models: MODELS,
			tasks: AI_TASKS
		};
	}),

	// Add a new named key
	addKey: protectedProcedure
		.input(z.object({ name: z.string().min(1).max(80), apiKey: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			let encrypted;
			try {
				encrypted = await encryptSecret(input.apiKey);
			} catch {
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'Error encrypting credentials. Check the KMS_MASTER_KEY configuration.'
				});
			}

			const id = crypto.randomUUID();
			await ctx.withRLS((db) =>
				db.insert(userApiKey).values({
					id,
					userId: ctx.user.id,
					name: input.name,
					...encrypted,
					enabled: true
				})
			);

			return { id };
		}),

	// Rename a key
	renameKey: protectedProcedure
		.input(z.object({ keyId: z.string(), name: z.string().min(1).max(80) }))
		.mutation(async ({ ctx, input }) => {
			await ctx.withRLS((db) =>
				db
					.update(userApiKey)
					.set({ name: input.name, updatedAt: new Date() })
					.where(eq(userApiKey.id, input.keyId))
			);
			return { ok: true };
		}),

	// Toggle enabled without deleting
	toggleKey: protectedProcedure
		.input(z.object({ keyId: z.string(), enabled: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			await ctx.withRLS((db) =>
				db
					.update(userApiKey)
					.set({ enabled: input.enabled, updatedAt: new Date() })
					.where(eq(userApiKey.id, input.keyId))
			);
			return { enabled: input.enabled };
		}),

	// Delete a key — also clears any task configs that reference it
	deleteKey: protectedProcedure
		.input(z.object({ keyId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			await ctx.withRLS((db) => db.delete(userApiKey).where(eq(userApiKey.id, input.keyId)));

			// Remove references to deleted key from task config
			const rows = (await ctx.withRLS((db) =>
				db
					.select({ aiTaskConfig: userProfile.aiTaskConfig })
					.from(userProfile)
					.where(eq(userProfile.userId, ctx.user.id))
					.limit(1)
			)) as { aiTaskConfig: string | null }[];

			const config = parseTaskConfig(rows[0]?.aiTaskConfig ?? null);
			let changed = false;
			for (const task of Object.keys(config) as AiTask[]) {
				if (config[task]?.keyId === input.keyId) {
					delete config[task];
					changed = true;
				}
			}
			if (changed) {
				await ctx.withRLS((db) =>
					db
						.update(userProfile)
						.set({ aiTaskConfig: JSON.stringify(config), updatedAt: new Date() })
						.where(eq(userProfile.userId, ctx.user.id))
				);
			}

			return { ok: true };
		}),

	// Set key + model for a specific task
	setTaskConfig: protectedProcedure
		.input(
			z.object({
				task: z.enum(AI_TASKS.map((t) => t.id) as [AiTask, ...AiTask[]]),
				keyId: z.string(),
				model: z.string().min(1)
			})
		)
		.mutation(async ({ ctx, input }) => {
			const rows = (await ctx.withRLS((db) =>
				db
					.select({ aiTaskConfig: userProfile.aiTaskConfig })
					.from(userProfile)
					.where(eq(userProfile.userId, ctx.user.id))
					.limit(1)
			)) as { aiTaskConfig: string | null }[];

			const config = parseTaskConfig(rows[0]?.aiTaskConfig ?? null);
			config[input.task] = { keyId: input.keyId, model: input.model };

			await ctx.withRLS((db) =>
				db
					.update(userProfile)
					.set({ aiTaskConfig: JSON.stringify(config), updatedAt: new Date() })
					.where(eq(userProfile.userId, ctx.user.id))
			);

			return { ok: true };
		}),

	// Clear config for a specific task (fallback to default)
	clearTaskConfig: protectedProcedure
		.input(z.object({ task: z.enum(AI_TASKS.map((t) => t.id) as [AiTask, ...AiTask[]]) }))
		.mutation(async ({ ctx, input }) => {
			const rows = (await ctx.withRLS((db) =>
				db
					.select({ aiTaskConfig: userProfile.aiTaskConfig })
					.from(userProfile)
					.where(eq(userProfile.userId, ctx.user.id))
					.limit(1)
			)) as { aiTaskConfig: string | null }[];

			const config = parseTaskConfig(rows[0]?.aiTaskConfig ?? null);
			delete config[input.task];

			await ctx.withRLS((db) =>
				db
					.update(userProfile)
					.set({ aiTaskConfig: JSON.stringify(config), updatedAt: new Date() })
					.where(eq(userProfile.userId, ctx.user.id))
			);

			return { ok: true };
		})
});
