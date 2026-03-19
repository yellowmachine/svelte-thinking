import { describe, it, expect, beforeAll } from 'vitest';
import { TRPCError } from '@trpc/server';
import { createTestDb, createTestCaller, type TestDb } from '$lib/server/db/test-utils';
import { userProfile } from '$lib/server/db/schemas/users.schema';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_A = 'trpc-user-a';
const USER_B = 'trpc-user-b';

let db: TestDb;

beforeAll(async () => {
	db = await createTestDb();

	// Seed profiles (superuser — bypasses RLS for setup)
	await db.insert(userProfile).values([
		{ id: USER_A, userId: USER_A, displayName: 'User A' },
		{ id: USER_B, userId: USER_B, displayName: 'User B' }
	]);
}, 30_000);

// ── projects router ───────────────────────────────────────────────────────────

describe('tRPC: projects', () => {
	let projectId: string;

	it('crear proyecto retorna el proyecto creado', async () => {
		const caller = createTestCaller(db, USER_A);
		const result = await caller.projects.create({ title: 'Mi primer proyecto' });

		expect(result.title).toBe('Mi primer proyecto');
		expect(result.ownerId).toBe(USER_A);
		projectId = result.id;
	});

	it('list solo devuelve proyectos del usuario', async () => {
		const callerA = createTestCaller(db, USER_A);
		const callerB = createTestCaller(db, USER_B);

		const projectsA = await callerA.projects.list();
		const projectsB = await callerB.projects.list();

		expect(projectsA.map((p) => p.id)).toContain(projectId);
		expect(projectsB.map((p) => p.id)).not.toContain(projectId);
	});

	it('byId lanza NOT_FOUND si el usuario no tiene acceso', async () => {
		const callerB = createTestCaller(db, USER_B);
		await expect(callerB.projects.byId(projectId)).rejects.toMatchObject({
			code: 'NOT_FOUND'
		});
	});

	it('myRole devuelve owner para el creador', async () => {
		const caller = createTestCaller(db, USER_A);
		const role = await caller.projects.myRole(projectId);
		expect(role).toBe('owner');
	});

	it('update modifica el titulo', async () => {
		const caller = createTestCaller(db, USER_A);
		const updated = await caller.projects.update({ id: projectId, title: 'Título actualizado' });
		expect(updated.title).toBe('Título actualizado');
	});

	it('update lanza NOT_FOUND si otro usuario intenta modificar', async () => {
		const callerB = createTestCaller(db, USER_B);
		await expect(
			callerB.projects.update({ id: projectId, title: 'Hackeado' })
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});
});

// ── documents router ──────────────────────────────────────────────────────────

describe('tRPC: documents', () => {
	let projectId: string;
	let documentId: string;

	beforeAll(async () => {
		const caller = createTestCaller(db, USER_A);
		const p = await caller.projects.create({ title: 'Proyecto para documentos' });
		projectId = p.id;
	});

	it('crear documento retorna el documento con version inicial', async () => {
		const caller = createTestCaller(db, USER_A);
		const doc = await caller.documents.create({
			projectId,
			title: 'Introducción',
			type: 'paper'
		});

		expect(doc.title).toBe('Introducción');
		expect(doc.projectId).toBe(projectId);
		expect(doc.currentVersionId).not.toBeNull();
		documentId = doc.id;
	});

	it('list devuelve los documentos del proyecto', async () => {
		const caller = createTestCaller(db, USER_A);
		const docs = await caller.documents.list(projectId);
		expect(docs.map((d) => d.id)).toContain(documentId);
	});

	it('usuario sin acceso no ve los documentos', async () => {
		const callerB = createTestCaller(db, USER_B);
		const docs = await callerB.documents.list(projectId);
		expect(docs).toHaveLength(0);
	});

	it('saveDraft persiste el borrador', async () => {
		const caller = createTestCaller(db, USER_A);
		await caller.documents.saveDraft({ documentId, content: 'Borrador inicial' });

		const doc = await caller.documents.withContent(documentId);
		expect(doc.content).toBe('Borrador inicial');
		expect(doc.hasDraft).toBe(true);
	});

	it('commit crea una version y limpia el draft', async () => {
		const caller = createTestCaller(db, USER_A);
		const result = await caller.documents.commit({
			documentId,
			message: 'Primera versión'
		});

		expect(result.versionNumber).toBe(2);

		const doc = await caller.documents.withContent(documentId);
		expect(doc.hasDraft).toBe(false);
		expect(doc.content).toBe('Borrador inicial');
	});

	it('commit lanza BAD_REQUEST si no hay draft', async () => {
		const caller = createTestCaller(db, USER_A);
		await expect(
			caller.documents.commit({ documentId, message: 'Sin cambios' })
		).rejects.toMatchObject({ code: 'BAD_REQUEST' });
	});

	it('versions devuelve el historial de commits', async () => {
		const caller = createTestCaller(db, USER_A);
		const versions = await caller.documents.versions(documentId);
		expect(versions.length).toBeGreaterThanOrEqual(2);
		expect(versions[0].changeDescription).toBe('Primera versión');
	});

	it('delete lanza NOT_FOUND si otro usuario intenta borrar', async () => {
		const callerB = createTestCaller(db, USER_B);
		await expect(callerB.documents.delete(documentId)).rejects.toMatchObject({
			code: 'NOT_FOUND'
		});
	});
});
