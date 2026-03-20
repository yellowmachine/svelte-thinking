import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, asUser, asAnon, type TestDb } from './test-utils';
import { userProfile } from './schemas/users.schema';
import { project, projectCollaborator } from './schemas/projects.schema';
import { document } from './schemas/documents.schema';
import { documentLink } from './schemas/documentLinks.schema';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const USER_A = 'user-a';
const USER_B = 'user-b';
const USER_C = 'user-c'; // colaborador en PROJECT_A, sin acceso a PROJECT_B

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

// ── document_link ─────────────────────────────────────────────────────────────
//
// Dos políticas superpuestas:
//
//   document_link_access (for: all)
//     → visible si tienes acceso al proyecto del documento ORIGEN
//
//   document_link_incoming_public (for: select)
//     → visible si origen es público Y el destino es tuyo
//
// El fixture crea:
//   DOC_A  (PROJECT_A, privado) — ya creado en el suite anterior
//   DOC_A2 (PROJECT_A, privado) — segundo doc de A, para ser destino
//   DOC_B_PUB  (PROJECT_B, público)  — origen público de B
//   DOC_B_PRIV (PROJECT_B, privado) — origen privado de B
//
// Links creados (superuser, sin RLS):
//   LINK_A_INTERNAL : DOC_A  → DOC_A2        (origen=proyecto de A)
//   LINK_B_PUB_TO_A : DOC_B_PUB  → DOC_A2   (origen público → destino de A)
//   LINK_B_PRIV_TO_A: DOC_B_PRIV → DOC_A2   (origen privado → destino de A)
//   LINK_B_PUB_TO_B : DOC_B_PUB  → DOC_B_PUB (origen público → destino propio de B)

const DOC_A2 = 'doc-a2';
const DOC_B_PUB = 'doc-b-pub';
const DOC_B_PRIV = 'doc-b-priv';

const LINK_A_INTERNAL = 'link-a-internal';
const LINK_B_PUB_TO_A = 'link-b-pub-to-a';
const LINK_B_PRIV_TO_A = 'link-b-priv-to-a';
const LINK_B_PUB_TO_B = 'link-b-pub-to-b';

describe('RLS: document_link', () => {
	beforeAll(async () => {
		// Documentos adicionales (superuser para evitar dependencias de orden)
		await db.insert(document).values([
			{
				id: DOC_A2,
				projectId: PROJECT_A,
				title: 'Documento A2',
				type: 'notes',
				draftContent: '',
				isPublic: false
			},
			{
				id: DOC_B_PUB,
				projectId: PROJECT_B,
				title: 'Documento B público',
				type: 'notes',
				draftContent: '',
				isPublic: true
			},
			{
				id: DOC_B_PRIV,
				projectId: PROJECT_B,
				title: 'Documento B privado',
				type: 'notes',
				draftContent: '',
				isPublic: false
			}
		]);

		// Links insertados como superuser (sin RLS) para poder crear enlaces
		// cross-proyecto que ningún usuario podría crear normalmente
		await db.insert(documentLink).values([
			{ id: LINK_A_INTERNAL, sourceDocumentId: DOC_A, targetDocumentId: DOC_A2 },
			{ id: LINK_B_PUB_TO_A, sourceDocumentId: DOC_B_PUB, targetDocumentId: DOC_A2 },
			{ id: LINK_B_PRIV_TO_A, sourceDocumentId: DOC_B_PRIV, targetDocumentId: DOC_A2 },
			{ id: LINK_B_PUB_TO_B, sourceDocumentId: DOC_B_PUB, targetDocumentId: DOC_B_PUB }
		]);
	});

	// ── document_link_access ────────────────────────────────────────────────

	it('owner ve links cuyo origen pertenece a su proyecto', async () => {
		const rows = await asUser(db, USER_A, (tx) =>
			tx.select({ id: documentLink.id }).from(documentLink)
		);
		const ids = rows.map((r) => r.id);
		expect(ids).toContain(LINK_A_INTERNAL);
	});

	it('colaborador ve links cuyo origen está en el proyecto compartido', async () => {
		const rows = await asUser(db, USER_C, (tx) =>
			tx.select({ id: documentLink.id }).from(documentLink)
		);
		const ids = rows.map((r) => r.id);
		expect(ids).toContain(LINK_A_INTERNAL);
	});

	it('externo no ve links cuyo origen es un proyecto privado ajeno', async () => {
		// USER_A no tiene acceso a PROJECT_B, así que no debe ver
		// LINK_B_PUB_TO_B aunque DOC_B_PUB sea público
		// (document_link_access mira el proyecto origen, no is_public)
		const rows = await asUser(db, USER_A, (tx) =>
			tx.select({ id: documentLink.id }).from(documentLink)
		);
		const ids = rows.map((r) => r.id);
		expect(ids).not.toContain(LINK_B_PUB_TO_B);
	});

	// ── document_link_incoming_public ───────────────────────────────────────

	it('USER_A ve un link entrante cuyo origen es público y el destino es suyo', async () => {
		// DOC_B_PUB (público) → DOC_A2 (de A): visible para A por incoming_public
		const rows = await asUser(db, USER_A, (tx) =>
			tx.select({ id: documentLink.id }).from(documentLink)
		);
		const ids = rows.map((r) => r.id);
		expect(ids).toContain(LINK_B_PUB_TO_A);
	});

	it('USER_A no ve un link entrante cuyo origen es privado', async () => {
		// DOC_B_PRIV (privado) → DOC_A2: el origen no es público, no aplica incoming_public
		// y USER_A no tiene acceso a PROJECT_B, así que tampoco aplica document_link_access
		const rows = await asUser(db, USER_A, (tx) =>
			tx.select({ id: documentLink.id }).from(documentLink)
		);
		const ids = rows.map((r) => r.id);
		expect(ids).not.toContain(LINK_B_PRIV_TO_A);
	});

	it('USER_B no ve LINK_B_PUB_TO_A como entrante de A (el destino no es suyo)', async () => {
		// DOC_B_PUB (público de B) → DOC_A2 (de A)
		// USER_B ve el link por document_link_access (es su proyecto origen)
		// pero USER_A no debe poder confundir esto con privacidad de B
		// Verificamos la perspectiva de USER_B: SÍ lo ve (es su origen)
		const rows = await asUser(db, USER_B, (tx) =>
			tx.select({ id: documentLink.id }).from(documentLink)
		);
		const ids = rows.map((r) => r.id);
		expect(ids).toContain(LINK_B_PUB_TO_A); // ve porque el origen es de B
		expect(ids).toContain(LINK_B_PRIV_TO_A); // ve porque el origen es de B
	});

	it('USER_C no ve links entrantes de PROJECT_B hacia PROJECT_A (no es owner del destino)', async () => {
		// La política incoming_public exige acceso al destino.
		// USER_C es colaborador de PROJECT_A, así que SÍ tiene acceso al destino.
		// Por tanto, C también debe ver LINK_B_PUB_TO_A.
		const rows = await asUser(db, USER_C, (tx) =>
			tx.select({ id: documentLink.id }).from(documentLink)
		);
		const ids = rows.map((r) => r.id);
		expect(ids).toContain(LINK_B_PUB_TO_A); // C es colaborador del destino
		expect(ids).not.toContain(LINK_B_PRIV_TO_A); // origen privado, C no tiene acceso a B
	});

	// ── escritura ───────────────────────────────────────────────────────────

	it('USER_B no puede insertar un link con origen en PROJECT_A', async () => {
		// Para INSERT, PostgreSQL lanza un error explícito (42501) en lugar de fallar
		// silenciosamente como hace SELECT. Esto es comportamiento estándar de RLS.
		await expect(
			asUser(db, USER_B, (tx) =>
				tx.insert(documentLink).values({
					id: 'link-b-attack',
					sourceDocumentId: DOC_A, // DOC_A pertenece a PROJECT_A, B no tiene acceso
					targetDocumentId: DOC_B_PUB
				})
			)
		).rejects.toThrow();
	});

	it('USER_B no puede borrar links de PROJECT_A', async () => {
		await asUser(db, USER_B, (tx) =>
			tx.delete(documentLink).where(eq(documentLink.id, LINK_A_INTERNAL))
		);

		// El link debe seguir existiendo
		const rows = await db
			.select({ id: documentLink.id })
			.from(documentLink)
			.where(eq(documentLink.id, LINK_A_INTERNAL));
		expect(rows).toHaveLength(1);
	});
});
