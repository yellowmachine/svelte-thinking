// Shared OpenRouter API access — model catalog resolution, pricing, cached.
//
// Two layers of caching:
//   - In-memory (module-level, 1h): the raw OpenRouter catalog fetch, shared by
//     every function below so we only hit the network once per hour per instance.
//   - Redis (5 days, via $lib/server/cache): the *resolved* per-family catalog
//     (see MODEL_FAMILIES in $lib/ai-config), shared across instances. Redis
//     being down/unset degrades gracefully to the in-memory layer (cache.ts
//     already no-ops in that case).

import { type AiTask, AI_TASKS, MODEL_FAMILIES } from '$lib/ai-config';
import { cacheGet, cacheSet, CACHE_KEY, TTL } from '$lib/server/cache';

// ---------------------------------------------------------------------------
// Raw catalog fetch (in-memory cache, 1 hour)
// ---------------------------------------------------------------------------

interface RawModel {
	id: string;
	created: number;
	pricing: { input: number; output: number };
	toolCalling: boolean;
}

interface RawCatalogCache {
	fetchedAt: number;
	models: RawModel[];
}

let rawCache: RawCatalogCache | null = null;
const RAW_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function fetchRawCatalog(): Promise<RawModel[]> {
	if (rawCache && Date.now() - rawCache.fetchedAt < RAW_CACHE_TTL_MS) {
		return rawCache.models;
	}

	try {
		const res = await fetch('https://openrouter.ai/api/v1/models', {
			headers: { 'User-Agent': 'Scholio/1.0' }
		});
		if (!res.ok) return rawCache?.models ?? [];

		const data = (await res.json()) as {
			data: {
				id: string;
				created?: number;
				pricing?: { prompt?: string; completion?: string };
				supported_parameters?: string[];
			}[];
		};

		const models: RawModel[] = [];
		for (const model of data.data) {
			const input = parseFloat(model.pricing?.prompt ?? '0');
			const output = parseFloat(model.pricing?.completion ?? '0');
			if (isNaN(input) || isNaN(output)) continue;
			models.push({
				id: model.id,
				created: model.created ?? 0,
				pricing: { input, output },
				toolCalling: model.supported_parameters?.includes('tools') ?? false
			});
		}

		rawCache = { fetchedAt: Date.now(), models };
		return models;
	} catch {
		return rawCache?.models ?? [];
	}
}

export async function fetchOpenRouterPrices(): Promise<
	Record<string, { input: number; output: number }>
> {
	const models = await fetchRawCatalog();
	return Object.fromEntries(models.map((m) => [m.id, m.pricing]));
}

// Returns the set of model ids currently served by OpenRouter, or null if we've
// never had a successful fetch (so callers can distinguish "unknown" from "empty"
// and avoid false positives when OpenRouter is unreachable).
export async function getValidOpenRouterModelIds(): Promise<Set<string> | null> {
	const models = await fetchRawCatalog();
	if (!rawCache) return null;
	return new Set(models.map((m) => m.id));
}

function formatPrice(pricePerToken: number): string {
	const perMillion = pricePerToken * 1_000_000;
	if (perMillion === 0) return 'free';
	if (perMillion < 0.01) return `$${(perMillion * 1000).toFixed(2)}/1B`;
	if (perMillion < 1) return `$${perMillion.toFixed(3)}/1M`;
	return `$${perMillion.toFixed(2)}/1M`;
}

// ---------------------------------------------------------------------------
// Resolved per-family catalog (Redis cache, 5 days)
// ---------------------------------------------------------------------------

export interface ResolvedModel {
	id: string;
	familyKey: string;
	label: string;
	shortLabel: string;
	toolCalling: boolean;
	pricing: string | null;
}

// Last-resort fallback if the entire catalog resolution comes back empty
// (OpenRouter unreachable AND no warm cache anywhere). Never cached in Redis —
// see getModelCatalog — so we retry resolving the real catalog on the next call
// rather than getting stuck serving this for the full 5-day TTL.
const SAFETY_NET_MODEL: ResolvedModel = {
	id: 'anthropic/claude-haiku-4.5',
	familyKey: 'claude-haiku',
	label: 'Claude Haiku (fast)',
	shortLabel: 'Haiku',
	toolCalling: true,
	pricing: null
};

export async function getModelCatalog(): Promise<ResolvedModel[]> {
	const cached = await cacheGet<ResolvedModel[]>(CACHE_KEY.modelCatalog());
	if (cached && cached.length > 0) return cached;

	const raw = await fetchRawCatalog();
	const resolved: ResolvedModel[] = [];
	for (const family of MODEL_FAMILIES) {
		const matches = raw.filter((m) => family.pattern.test(m.id));
		if (matches.length === 0) continue;
		const best = matches.reduce((a, b) => (b.created > a.created ? b : a));
		resolved.push({
			id: best.id,
			familyKey: family.key,
			label: family.label,
			shortLabel: family.shortLabel,
			toolCalling: best.toolCalling,
			pricing: `${formatPrice(best.pricing.input)} in · ${formatPrice(best.pricing.output)} out`
		});
	}

	if (resolved.length === 0) return [SAFETY_NET_MODEL];

	await cacheSet(CACHE_KEY.modelCatalog(), resolved, TTL.modelCatalog);
	return resolved;
}

export async function getDefaultModelId(task: AiTask): Promise<string> {
	const family = AI_TASKS.find((t) => t.id === task)?.defaultFamily;
	const catalog = await getModelCatalog();
	return catalog.find((m) => m.familyKey === family)?.id ?? SAFETY_NET_MODEL.id;
}
