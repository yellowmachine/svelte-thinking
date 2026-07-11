// Shared OpenRouter API access — model pricing/catalog, cached in memory.

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

// Returns the set of model ids currently served by OpenRouter, or null if we've
// never had a successful fetch (so callers can distinguish "unknown" from "empty"
// and avoid false positives when OpenRouter is unreachable).
export async function getValidOpenRouterModelIds(): Promise<Set<string> | null> {
	const prices = await fetchOpenRouterPrices();
	if (!pricingCache) return null;
	return new Set(Object.keys(prices));
}
