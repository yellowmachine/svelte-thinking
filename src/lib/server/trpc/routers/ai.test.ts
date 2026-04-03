/**
 * Tests for the AI backend logic:
 * 1. indexDocument — chunking + embed + upsert in document_chunk
 * 2. search_documents_semantic — vector similarity via the agent tool
 * 3. Agent loop — correct tool dispatch with mocked OpenRouter
 */

import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import { createTestDb, createTestCaller, type TestDb } from '$lib/server/db/test-utils';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { document, documentVersion } from '$lib/server/db/schemas/documents.schema';
import { project } from '$lib/server/db/schemas/projects.schema';
import { documentChunk } from '$lib/server/db/schemas/documentChunks.schema';
import { eq } from 'drizzle-orm';
import { indexDocument } from '$lib/server/embeddings';

// ── Constants ──────────────────────────────────────────────────────────────

const USER = 'ai-test-user';

// Deterministic fake embedding (384 dims) — all zeros except first element
function fakeEmbedding(seed = 1): number[] {
	const vec = new Array(384).fill(0);
	vec[0] = seed * 0.1;
	return vec;
}

// ── Setup ──────────────────────────────────────────────────────────────────

let db: TestDb;
let projectId: string;
let documentId: string;

beforeAll(async () => {
	db = await createTestDb();

	await db.insert(userProfile).values({ id: USER, userId: USER, displayName: 'AI Test User' });

	const caller = createTestCaller(db, USER);
	const proj = await caller.projects.create({ title: 'Test Project' });
	projectId = proj.id;

	const doc = await caller.documents.create({ projectId, title: 'Introducción', type: 'paper' });
	documentId = doc.id;
}, 60_000);

afterEach(() => {
	vi.restoreAllMocks();
});

// ── 1. indexDocument ───────────────────────────────────────────────────────

describe('indexDocument', () => {
	it('chunkea el contenido y crea filas en document_chunk', async () => {
		// Mock embed-service: devuelve embeddings falsos sin llamar al servidor real
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					embeddings: [fakeEmbedding(1), fakeEmbedding(2), fakeEmbedding(3)]
				})
			})
		);

		const content = [
			'La metodología empleada sigue un enfoque cuantitativo basado en encuestas estructuradas.',
			'Los resultados muestran una correlación significativa entre las variables analizadas (p < 0.05).',
			'En conclusión, el modelo explicativo propuesto es consistente con la evidencia empírica recogida.'
		].join('\n\n');

		// withRLS wrapper para indexDocument (mismo patrón que hooks.server.ts)
		const withRLS = <T>(fn: (tx: TestDb) => Promise<T>) =>
			db.transaction(async (tx: TestDb) => {
				await (tx as any).execute(
					`SELECT set_config('app.current_user_id', '${USER}', true)`
				);
				return fn(tx);
			});

		await withRLS((tx) => indexDocument(tx as any, documentId, projectId, content));

		const chunks = await db
			.select()
			.from(documentChunk)
			.where(eq(documentChunk.documentId, documentId));

		expect(chunks.length).toBe(3);
		expect(chunks[0].chunkIndex).toBe(0);
		expect(chunks[0].text).toContain('metodología');
		expect(chunks[0].embedding).toHaveLength(384);
	});

	it('remplaza chunks existentes al re-indexar', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ embeddings: [fakeEmbedding(1)] })
			})
		);

		const withRLS = <T>(fn: (tx: TestDb) => Promise<T>) =>
			db.transaction(async (tx: TestDb) => {
				await (tx as any).execute(
					`SELECT set_config('app.current_user_id', '${USER}', true)`
				);
				return fn(tx);
			});

		await withRLS((tx) =>
			indexDocument(tx as any, documentId, projectId, 'Un único párrafo corto con suficiente texto para pasar el filtro de longitud mínima.')
		);

		const chunks = await db
			.select()
			.from(documentChunk)
			.where(eq(documentChunk.documentId, documentId));

		expect(chunks.length).toBe(1);
	});

	it('elimina chunks si el contenido queda vacío', async () => {
		vi.stubGlobal('fetch', vi.fn());

		const withRLS = <T>(fn: (tx: TestDb) => Promise<T>) =>
			db.transaction(async (tx: TestDb) => {
				await (tx as any).execute(
					`SELECT set_config('app.current_user_id', '${USER}', true)`
				);
				return fn(tx);
			});

		await withRLS((tx) => indexDocument(tx as any, documentId, projectId, ''));

		const chunks = await db
			.select()
			.from(documentChunk)
			.where(eq(documentChunk.documentId, documentId));

		expect(chunks.length).toBe(0);
		// fetch no debe llamarse si no hay chunks que embeber
		expect(vi.mocked(fetch)).not.toHaveBeenCalled();
	});
});

// ── 2. commit → indexDocument (integración tRPC) ───────────────────────────

describe('documents.commit triggers indexing', () => {
	it('tras commit existen chunks para el documento', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					embeddings: [fakeEmbedding(1), fakeEmbedding(2)]
				})
			})
		);

		const caller = createTestCaller(db, USER);

		// Poner contenido en draft y commitear
		await caller.documents.saveDraft({
			documentId,
			content: [
				'La hipótesis central del estudio sostiene que existe una relación causal entre X e Y.',
				'Los datos recopilados durante seis meses respaldan esta hipótesis con un nivel de confianza del 95%.'
			].join('\n\n')
		});

		await caller.documents.commit({ documentId, message: 'Primera versión' });

		// Esperar a que el fire-and-forget se complete
		await new Promise((r) => setTimeout(r, 100));

		const chunks = await db
			.select()
			.from(documentChunk)
			.where(eq(documentChunk.documentId, documentId));

		expect(chunks.length).toBeGreaterThan(0);
		expect(fetch).toHaveBeenCalledWith(
			expect.stringContaining('/embed'),
			expect.any(Object)
		);
	});
});

// ── 3. search_documents_semantic (tool via agente) ─────────────────────────

describe('ai.sendMessage — search_documents_semantic', () => {
	it('el agente llama a search_documents_semantic y devuelve respuesta', async () => {
		// Seed chunks manualmente para esta prueba
		await db.insert(documentChunk).values([
			{
				id: crypto.randomUUID(),
				documentId,
				projectId,
				chunkIndex: 0,
				text: 'La teoría del capital de Böhm-Bawerk explica la estructura de producción.',
				embedding: fakeEmbedding(1)
			}
		]).onConflictDoNothing();

		const fetchMock = vi.fn();

		// Llamada 1: embed-service para la query
		// Llamada 2: OpenRouter con tool_call search_documents_semantic
		// Llamada 3: OpenRouter con respuesta final tras recibir el resultado del tool
		fetchMock
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ embeddings: [fakeEmbedding(1)] })
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					choices: [
						{
							finish_reason: 'tool_calls',
							message: {
								role: 'assistant',
								content: null,
								tool_calls: [
									{
										id: 'call-1',
										type: 'function',
										function: {
											name: 'search_documents_semantic',
											arguments: JSON.stringify({ query: 'teoría del capital' })
										}
									}
								]
							}
						}
					]
				})
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					choices: [
						{
							finish_reason: 'stop',
							message: {
								role: 'assistant',
								content: 'El proyecto menciona la teoría del capital de Böhm-Bawerk.'
							}
						}
					]
				})
			});

		vi.stubGlobal('fetch', fetchMock);

		const caller = createTestCaller(db, USER);
		const result = await caller.ai.sendMessage({
			projectId,
			message: '¿Qué dice el proyecto sobre la teoría del capital?'
		});

		expect(result.message.content).toContain('Böhm-Bawerk');
		// Verificar que se llamó a search_documents_semantic (2ª llamada a fetch es OpenRouter)
		const openRouterCall = fetchMock.mock.calls.find(
			([url]) => typeof url === 'string' && url.includes('openrouter')
		);
		expect(openRouterCall).toBeDefined();
	});
});
