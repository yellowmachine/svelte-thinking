import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// In-memory stand-in for Redis — lets tests control warm/cold cache scenarios
// without a real Redis instance. There's no existing Redis-mocking precedent in
// this repo, so this establishes the pattern: mock $lib/server/cache directly.
const cacheStore = new Map<string, unknown>();

vi.mock('$lib/server/cache', () => ({
	cacheGet: vi.fn(async (key: string) => cacheStore.get(key) ?? null),
	cacheSet: vi.fn(async (key: string, value: unknown) => {
		cacheStore.set(key, value);
	}),
	CACHE_KEY: { modelCatalog: () => 'scholio:model-catalog' },
	TTL: { modelCatalog: 5 * 24 * 60 * 60 }
}));

type FakeModel = {
	id: string;
	created: number;
	toolCalling?: boolean;
	input?: number;
	output?: number;
};

function mockOpenRouterResponse(models: FakeModel[]) {
	vi.stubGlobal(
		'fetch',
		vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				data: models.map((m) => ({
					id: m.id,
					created: m.created,
					pricing: {
						prompt: String(m.input ?? 0.000001),
						completion: String(m.output ?? 0.000002)
					},
					supported_parameters: m.toolCalling ? ['tools'] : []
				}))
			})
		})
	);
}

function mockOpenRouterFailure() {
	vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
}

// The module keeps an in-memory rawCache singleton — reset it between tests so
// each scenario starts cold, matching a fresh server process.
beforeEach(() => {
	vi.resetModules();
	cacheStore.clear();
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('getModelCatalog: family resolution', () => {
	it('picks the highest-created match within a family', async () => {
		mockOpenRouterResponse([
			{ id: 'anthropic/claude-sonnet-4.5', created: 100, toolCalling: true },
			{ id: 'anthropic/claude-sonnet-4.6', created: 200, toolCalling: true }
		]);
		const { getModelCatalog } = await import('./openrouter');

		const catalog = await getModelCatalog();
		const sonnet = catalog.find((m) => m.familyKey === 'claude-sonnet');

		expect(sonnet?.id).toBe('anthropic/claude-sonnet-4.6');
	});

	it('does not match "-preview"/"-image" variants against the anchored family pattern', async () => {
		mockOpenRouterResponse([
			{ id: 'google/gemini-2.5-pro-preview', created: 100 },
			{ id: 'google/gemini-2.5-pro-image', created: 300 },
			{ id: 'google/gemini-2.5-pro', created: 200 }
		]);
		const { getModelCatalog } = await import('./openrouter');

		const catalog = await getModelCatalog();
		const geminiPro = catalog.find((m) => m.familyKey === 'gemini-pro');

		expect(geminiPro?.id).toBe('google/gemini-2.5-pro');
	});

	it('drops a family with zero matches instead of guessing', async () => {
		mockOpenRouterResponse([
			{ id: 'anthropic/claude-sonnet-4.6', created: 100, toolCalling: true }
		]);
		const { getModelCatalog } = await import('./openrouter');

		const catalog = await getModelCatalog();

		expect(catalog.find((m) => m.familyKey === 'gemini-pro')).toBeUndefined();
		expect(catalog.find((m) => m.familyKey === 'claude-sonnet')).toBeDefined();
	});

	it('falls back to the safety-net model when the catalog resolves empty and the cache is cold', async () => {
		mockOpenRouterFailure();
		const { getModelCatalog } = await import('./openrouter');

		const catalog = await getModelCatalog();

		expect(catalog).toHaveLength(1);
		expect(catalog[0].id).toBe('anthropic/claude-haiku-4.5');
	});

	it('does not cache the safety-net fallback in Redis', async () => {
		mockOpenRouterFailure();
		const { getModelCatalog } = await import('./openrouter');

		await getModelCatalog();

		expect(cacheStore.has('scholio:model-catalog')).toBe(false);
	});
});

describe('getModelCatalog: Redis cache', () => {
	it('serves from a warm Redis cache without refetching OpenRouter', async () => {
		const warmCatalog = [
			{
				id: 'anthropic/claude-sonnet-4.6',
				familyKey: 'claude-sonnet',
				label: 'Claude Sonnet',
				shortLabel: 'Sonnet',
				toolCalling: true,
				pricing: '$3.00/1M in · $15.00/1M out'
			}
		];
		cacheStore.set('scholio:model-catalog', warmCatalog);
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);
		const { getModelCatalog } = await import('./openrouter');

		const catalog = await getModelCatalog();

		expect(catalog).toEqual(warmCatalog);
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});

describe('getDefaultModelId', () => {
	it("resolves a task's default family to the current catalog id", async () => {
		mockOpenRouterResponse([{ id: 'anthropic/claude-haiku-4.5', created: 100, toolCalling: true }]);
		const { getDefaultModelId } = await import('./openrouter');

		const model = await getDefaultModelId('bibliography'); // defaultFamily: 'claude-haiku'

		expect(model).toBe('anthropic/claude-haiku-4.5');
	});

	it('falls back to the safety-net id when the resolved family is unavailable', async () => {
		mockOpenRouterResponse([{ id: 'openai/gpt-4o', created: 100, toolCalling: true }]);
		const { getDefaultModelId } = await import('./openrouter');

		const model = await getDefaultModelId('bibliography'); // claude-haiku family absent from response

		expect(model).toBe('anthropic/claude-haiku-4.5');
	});
});
