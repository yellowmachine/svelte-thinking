import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, asUser, asAnon, type TestDb } from './test-utils';
import { userProfile } from './schemas/users.schema';
import { project, projectCollaborator } from './schemas/projects.schema';
import { document } from './schemas/documents.schema';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const USER_A = 'user-a';
const USER_B = 'user-b';
const USER_C = 'user-c'; // not a member of any project

let db: TestDb;

beforeAll(async () => {
	db = await createTestDb();

	// Seed user profiles (superuser context, bypasses RLS for setup)
	await db.insert(userProfile).values([
		{ id: USER_A, userId: USER_A, displayName: 'User A' },
		{ id: USER_B, userId: USER_B, displayName: 'User B' },
		{ id: USER_C, userId: USER_C, displayName: 'User C' }
	]);
}, 30_000);

// ── user_profile ──────────────────────────────────────────────────────────────

describe('RLS: user_profile', () => {
	it('cualquier usuario autenticado puede leer perfiles', async () => {
		const rows = await asUser(db, USER_B, (tx) =>
			tx.select({ userId: userProfile.userId }).from(userProfile)
		);
		expect(rows.length).toBeGreaterThanOrEqual(2);
	});

	it('usuario no autenticado no puede leer perfiles', async () => {
		const rows = await asAnon(db, (tx) =>
			tx.select().from(userProfile)
		);
		expect(rows).toHaveLength(0);
	});

	it('usuario solo puede modificar su propio perfil', async () => {
		await asUser(db, USER_A, (tx) =>
			tx.update(userProfile)
				.set({ displayName: 'User A updated' })
				.where(eq(userProfile.userId, USER_A))
		);

		const rows = await asUser(db, USER_A, (tx) =>
			tx.select({ displayName: userProfile.displayName })
				.from(userProfile)
				.where(eq(userProfile.userId, USER_A))
		);
		expect(rows[0].displayName).toBe('User A updated');
	});

	it('usuario no puede modificar el perfil de otro', async () => {
		await asUser(db, USER_B, (tx) =>
			tx.update(userProfile)
				.set({ displayName: 'Hacked' })
				.where(eq(userProfile.userId, USER_A))
		);

		const rows = await asUser(db, USER_A, (tx) =>
			tx.select({ displayName: userProfile.displayName })
				.from(userProfile)
				.where(eq(userProfile.userId, USER_A))
		);
		// RLS silently prevents the update — name should not be 'Hacked'
		expect(rows[0].displayName).not.toBe('Hacked');
	});
});

// ── project ───────────────────────────────────────────────────────────────────

const PROJECT_A = 'project-a';
const PROJECT_B = 'project-b';

describe('RLS: project', () => {
	beforeAll(async () => {
		await asUser(db, USER_A, (tx) =>
			tx.insert(project).values({
				id: PROJECT_A,
				title: 'Proyecto de A',
				ownerId: USER_A,
				status: 'active'
			})
		);

		await asUser(db, USER_B, (tx) =>
			tx.insert(project).values({
				id: PROJECT_B,
				title: 'Proyecto de B',
				ownerId: USER_B,
				status: 'active'
			})
		);

		// Add USER_C as collaborator on PROJECT_A
		await db.insert(projectCollaborator).values({
			id: 'collab-c',
			projectId: PROJECT_A,
			userId: USER_C,
			role: 'reviewer'
		});
	});

	it('usuario ve sus propios proyectos', async () => {
		const rows = await asUser(db, USER_A, (tx) =>
			tx.select({ id: project.id }).from(project)
		);
		expect(rows.map((r) => r.id)).toContain(PROJECT_A);
	});

	it('usuario no ve proyectos privados de otro donde no es miembro', async () => {
		const rows = await asUser(db, USER_C, (tx) =>
			tx.select({ id: project.id }).from(project)
		);
		const ids = rows.map((r) => r.id);
		expect(ids).not.toContain(PROJECT_B); // B no compartió con C
		expect(ids).toContain(PROJECT_A);     // C es colaborador en A
	});

	it('usuario no autenticado no ve ningún proyecto', async () => {
		const rows = await asAnon(db, (tx) =>
			tx.select().from(project)
		);
		expect(rows).toHaveLength(0);
	});

	it('usuario no puede modificar proyectos ajenos', async () => {
		await asUser(db, USER_B, (tx) =>
			tx.update(project)
				.set({ title: 'Proyecto hackeado' })
				.where(eq(project.id, PROJECT_A))
		);

		const rows = await asUser(db, USER_A, (tx) =>
			tx.select({ title: project.title }).from(project).where(eq(project.id, PROJECT_A))
		);
		expect(rows[0].title).not.toBe('Proyecto hackeado');
	});
});

// ── document ──────────────────────────────────────────────────────────────────

const DOC_A = 'doc-a';

describe('RLS: document', () => {
	beforeAll(async () => {
		await asUser(db, USER_A, (tx) =>
			tx.insert(document).values({
				id: DOC_A,
				projectId: PROJECT_A,
				title: 'Documento de A',
				type: 'notes',
				draftContent: 'contenido'
			})
		);
	});

	it('colaborador del proyecto puede leer el documento', async () => {
		const rows = await asUser(db, USER_C, (tx) =>
			tx.select({ id: document.id }).from(document).where(eq(document.id, DOC_A))
		);
		expect(rows).toHaveLength(1);
	});

	it('usuario sin acceso al proyecto no puede leer el documento', async () => {
		const rows = await asUser(db, USER_B, (tx) =>
			tx.select({ id: document.id }).from(document).where(eq(document.id, DOC_A))
		);
		expect(rows).toHaveLength(0);
	});
});
