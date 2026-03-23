import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { loginAsTestUser } from './helpers/login';
import { TEST_USER } from './helpers/create-test-user';
import { COLLABORATOR_USER, getCollaboratorUserId } from './helpers/create-collaborator';
import { trpcMutate, trpcQuery, loginViaApi, loginViaApiNo2FA } from './helpers/create-test-document';
import { readFileSync } from 'fs';
import { join } from 'path';

const SECRET_FILE = join(import.meta.dirname, '.totp-secret');

// ── Helpers ──────────────────────────────────────────────────────────────────

async function loginAsCollaborator(page: Page) {
	await page.goto('/login');
	await page.fill('input[name="email"]', COLLABORATOR_USER.email);
	await page.fill('input[name="password"]', COLLABORATOR_USER.password);
	await page.click('button[type="submit"]');
	await page.waitForURL('/projects');
}

// ── Shared API helpers ────────────────────────────────────────────────────────

async function setupCollabProject(ownerCookie: string, collabCookie: string) {
	const project = await trpcMutate<{ id: string }>(
		'projects.create',
		{ title: '_test-collab-project' },
		ownerCookie
	);

	const doc = await trpcMutate<{ id: string }>(
		'documents.create',
		{ projectId: project.id, title: 'Documento colaborativo', type: 'paper' },
		ownerCookie
	);

	// Invitar + aceptar via API para no depender del UI del Flujo 1
	const invitation = await trpcMutate<{ token: string }>(
		'invitations.create',
		{ projectId: project.id, invitedEmail: COLLABORATOR_USER.email, role: 'reviewer' },
		ownerCookie
	);
	await trpcMutate('invitations.accept', invitation.token, collabCookie);

	return { projectId: project.id, docId: doc.id };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Flujo 1 — Registro e invitación colaborativa', () => {
	let ownerCookie: string;
	let projectId: string;
	let ownerContext: BrowserContext;
	let collabContext: BrowserContext;

	test.beforeAll(async ({ browser }) => {
		// Login del owner via API para operaciones tRPC
		const totpSecret = readFileSync(SECRET_FILE, 'utf-8').trim();
		ownerCookie = await loginViaApi(TEST_USER.email, TEST_USER.password, totpSecret);

		// Crear proyecto específico para este test
		const project = await trpcMutate<{ id: string }>(
			'projects.create',
			{ title: '_test-collab-project' },
			ownerCookie
		);
		projectId = project.id;

		// Contextos de browser separados para owner y collaborator
		ownerContext = await browser.newContext();
		collabContext = await browser.newContext();
	});

	test.afterAll(async () => {
		// Eliminar el proyecto de test via tRPC
		await trpcMutate('projects.delete', projectId, ownerCookie).catch(() => {});
		await ownerContext.close();
		await collabContext.close();
	});

	test('owner invita a colaborador desde la página del proyecto', async () => {
		const page = await ownerContext.newPage();
		await loginAsTestUser(page);

		await page.goto(`/projects/${projectId}`);

		// Abrir panel de colaboradores (si está en un accordion/tab)
		// Rellenar formulario de invitación
		await page.fill('input[type="email"]', COLLABORATOR_USER.email);
		await page.selectOption('select', 'reviewer');
		await page.getByRole('button', { name: 'Invitar' }).click();

		await expect(page.getByText('Invitación enviada correctamente')).toBeVisible();
		await page.close();
	});

	test('colaborador ve la invitación en /network', async () => {
		const page = await collabContext.newPage();
		await loginAsCollaborator(page);

		await page.goto('/network');

		await expect(page.getByText('_test-collab-project')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Aceptar' })).toBeVisible();
		await page.close();
	});

	test('colaborador acepta la invitación', async () => {
		const page = await collabContext.newPage();
		// Reusar sesión del contexto (ya logueado en el test anterior)
		await page.goto('/network');

		await page.getByRole('button', { name: 'Aceptar' }).click();

		// Tras aceptar, la invitación desaparece
		await expect(page.getByText('No tienes invitaciones pendientes')).toBeVisible();
		await page.close();
	});

	test('colaborador ve el proyecto en su lista', async () => {
		const page = await collabContext.newPage();
		await page.goto('/projects');

		await expect(page.getByText('_test-collab-project')).toBeVisible();
		await page.close();
	});

	test('colaborador NO ve botones exclusivos del owner', async () => {
		const page = await collabContext.newPage();
		await page.goto(`/projects/${projectId}`);

		// Botones que solo el owner debe ver
		await expect(page.getByRole('button', { name: 'Eliminar proyecto' })).not.toBeVisible();
		await expect(page.getByRole('button', { name: /Generar borrador/i })).not.toBeVisible();

		// Pero sí debe ver el contenido del proyecto
		await expect(page.getByText('_test-collab-project')).toBeVisible();
		await page.close();
	});

	test('badge de invitaciones desaparece del navbar tras aceptar', async () => {
		// Verificar que el navbar no muestra badge (ya aceptó)
		const page = await collabContext.newPage();
		await page.goto('/projects');

		const badge = page.locator('a[href="/network"] span.rounded-full');
		await expect(badge).not.toBeVisible();
		await page.close();
	});
});

test.describe('Flujo 2 — Colaboración en documentos', () => {
	let ownerCookie: string;
	let collabCookie: string;
	let projectId: string;
	let docId: string;
	let ownerContext: BrowserContext;
	let collabContext: BrowserContext;

	test.beforeAll(async ({ browser }) => {
		const totpSecret = readFileSync(SECRET_FILE, 'utf-8').trim();
		ownerCookie = await loginViaApi(TEST_USER.email, TEST_USER.password, totpSecret);
		collabCookie = await loginViaApiNo2FA(COLLABORATOR_USER.email, COLLABORATOR_USER.password);

		({ projectId, docId } = await setupCollabProject(ownerCookie, collabCookie));

		ownerContext = await browser.newContext();
		collabContext = await browser.newContext();
	});

	test.afterAll(async () => {
		await trpcMutate('projects.delete', projectId, ownerCookie).catch(() => {});
		await ownerContext.close();
		await collabContext.close();
	});

	test('colaborador deja un comentario general en el documento', async () => {
		const page = await collabContext.newPage();
		await loginAsCollaborator(page);

		await page.goto(`/projects/${projectId}/documents/${docId}`);

		// Abrir tab/panel de comentarios generales
		await page.getByRole('tab', { name: /comentarios/i }).click();
		await page.getByPlaceholder(/escribe un comentario/i).fill('Este párrafo necesita más referencias.');
		await page.getByRole('button', { name: /comentar/i }).click();

		await expect(page.getByText('Este párrafo necesita más referencias.')).toBeVisible();
		await page.close();
	});

	test('owner ve el comentario del colaborador', async () => {
		const page = await ownerContext.newPage();
		await loginAsTestUser(page);

		await page.goto(`/projects/${projectId}/documents/${docId}`);
		await page.getByRole('tab', { name: /comentarios/i }).click();

		await expect(page.getByText('Este párrafo necesita más referencias.')).toBeVisible();
		await expect(page.getByText(COLLABORATOR_USER.name)).toBeVisible();
		await page.close();
	});

	test('owner resuelve el comentario', async () => {
		const page = await ownerContext.newPage();
		await page.goto(`/projects/${projectId}/documents/${docId}`);
		await page.getByRole('tab', { name: /comentarios/i }).click();

		await page.getByRole('button', { name: /resolver/i }).first().click();

		// El comentario pasa a estado resuelto
		await expect(page.getByRole('button', { name: /reabrir/i }).first()).toBeVisible();
		await page.close();
	});

	test('owner hace commit del documento', async () => {
		const page = await ownerContext.newPage();
		await page.goto(`/projects/${projectId}/documents/${docId}`);

		await page.getByRole('button', { name: /commit/i }).click();
		await page.getByPlaceholder(/descripción del commit/i).fill('Primera versión revisada');
		await page.getByRole('button', { name: /confirmar/i }).click();

		await expect(page.getByText('Primera versión revisada')).toBeVisible();
		await page.close();
	});

	test('colaborador ve la nueva versión en el historial', async () => {
		const page = await collabContext.newPage();
		await page.goto(`/projects/${projectId}/documents/${docId}`);

		await page.getByRole('button', { name: /historial/i }).click();

		await expect(page.getByText('Primera versión revisada')).toBeVisible();
		await page.close();
	});

	test('colaborador puede abrir el diff de la versión', async () => {
		const page = await collabContext.newPage();
		await page.goto(`/projects/${projectId}/documents/${docId}`);

		await page.getByRole('button', { name: /historial/i }).click();

		// Abrir diff en nueva pestaña
		const [diffPage] = await Promise.all([
			page.context().waitForEvent('page'),
			page.getByRole('button', { name: /comparar/i }).first().click()
		]);

		await diffPage.waitForLoadState();
		await expect(diffPage.getByText('Primera versión revisada')).toBeVisible();

		await diffPage.close();
		await page.close();
	});
});

test.describe('Flujo 3a — Owner expulsa colaborador', () => {
	let ownerCookie: string;
	let collabCookie: string;
	let projectId: string;
	let collabUserId: string;
	let ownerContext: BrowserContext;
	let collabContext: BrowserContext;

	test.beforeAll(async ({ browser }) => {
		const totpSecret = readFileSync(SECRET_FILE, 'utf-8').trim();
		ownerCookie = await loginViaApi(TEST_USER.email, TEST_USER.password, totpSecret);
		collabCookie = await loginViaApiNo2FA(COLLABORATOR_USER.email, COLLABORATOR_USER.password);
		collabUserId = await getCollaboratorUserId();

		({ projectId } = await setupCollabProject(ownerCookie, collabCookie));

		ownerContext = await browser.newContext();
		collabContext = await browser.newContext();
	});

	test.afterAll(async () => {
		await trpcMutate('projects.delete', projectId, ownerCookie).catch(() => {});
		await ownerContext.close();
		await collabContext.close();
	});

	test('owner expulsa al colaborador desde la página del proyecto', async () => {
		const page = await ownerContext.newPage();
		await loginAsTestUser(page);

		await page.goto(`/projects/${projectId}`);

		await page.getByRole('button', { name: /expulsar/i }).first().click();

		// Confirmar en SafeDeleteDialog — introducir el código de 3 caracteres
		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible();
		const code = await dialog.locator('span.font-mono').allTextContents();
		await dialog.locator('input[type="text"]').fill(code.join(''));
		await dialog.getByRole('button', { name: /expulsar/i }).click();

		await expect(page.getByText(COLLABORATOR_USER.name)).not.toBeVisible();
		await page.close();
	});

	test('colaborador expulsado no puede acceder al proyecto', async () => {
		const page = await collabContext.newPage();
		await loginAsCollaborator(page);

		await page.goto(`/projects/${projectId}`);

		// Debe redirigir a /projects o mostrar error — no puede ver el contenido
		await expect(page).not.toHaveURL(`/projects/${projectId}`);
		await page.close();
	});

	test('el proyecto desaparece de la lista del colaborador', async () => {
		const page = await collabContext.newPage();
		await page.goto('/projects');

		await expect(page.getByText('_test-collab-project')).not.toBeVisible();
		await page.close();
	});
});

test.describe('Flujo 3b — Colaborador abandona proyecto', () => {
	let ownerCookie: string;
	let collabCookie: string;
	let projectId: string;
	let ownerContext: BrowserContext;
	let collabContext: BrowserContext;

	test.beforeAll(async ({ browser }) => {
		const totpSecret = readFileSync(SECRET_FILE, 'utf-8').trim();
		ownerCookie = await loginViaApi(TEST_USER.email, TEST_USER.password, totpSecret);
		collabCookie = await loginViaApiNo2FA(COLLABORATOR_USER.email, COLLABORATOR_USER.password);

		({ projectId } = await setupCollabProject(ownerCookie, collabCookie));

		ownerContext = await browser.newContext();
		collabContext = await browser.newContext();
	});

	test.afterAll(async () => {
		await trpcMutate('projects.delete', projectId, ownerCookie).catch(() => {});
		await ownerContext.close();
		await collabContext.close();
	});

	test('colaborador abandona el proyecto desde la página del proyecto', async () => {
		const page = await collabContext.newPage();
		await loginAsCollaborator(page);

		await page.goto(`/projects/${projectId}`);

		await page.getByRole('button', { name: /abandonar proyecto/i }).click();

		// Confirmar en SafeDeleteDialog
		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible();
		const code = await dialog.locator('span.font-mono').allTextContents();
		await dialog.locator('input[type="text"]').fill(code.join(''));
		await dialog.getByRole('button', { name: /abandonar/i }).click();

		// Tras abandonar, redirige fuera del proyecto
		await expect(page).not.toHaveURL(`/projects/${projectId}`);
		await page.close();
	});

	test('el proyecto desaparece de la lista del colaborador', async () => {
		const page = await collabContext.newPage();
		await page.goto('/projects');

		await expect(page.getByText('_test-collab-project')).not.toBeVisible();
		await page.close();
	});

	test('owner sigue viendo el proyecto tras la salida del colaborador', async () => {
		const page = await ownerContext.newPage();
		await loginAsTestUser(page);

		await page.goto('/projects');
		await expect(page.getByText('_test-collab-project')).toBeVisible();

		await page.goto(`/projects/${projectId}`);
		await expect(page.getByText(COLLABORATOR_USER.name)).not.toBeVisible();
		await page.close();
	});
});

test.describe('Flujo 4 — Seguridad RLS', () => {
	let ownerCookie: string;
	let collabCookie: string;
	let privateProjectId: string;
	let privateDocId: string;
	let collabContext: BrowserContext;

	test.beforeAll(async ({ browser }) => {
		const totpSecret = readFileSync(SECRET_FILE, 'utf-8').trim();
		ownerCookie = await loginViaApi(TEST_USER.email, TEST_USER.password, totpSecret);
		collabCookie = await loginViaApiNo2FA(COLLABORATOR_USER.email, COLLABORATOR_USER.password);

		// Proyecto privado del owner — colaborador NO está invitado
		const project = await trpcMutate<{ id: string }>(
			'projects.create',
			{ title: '_test-private-project' },
			ownerCookie
		);
		privateProjectId = project.id;

		const doc = await trpcMutate<{ id: string }>(
			'documents.create',
			{ projectId: privateProjectId, title: 'Documento privado', type: 'paper' },
			ownerCookie
		);
		privateDocId = doc.id;

		collabContext = await browser.newContext();
	});

	test.afterAll(async () => {
		await trpcMutate('projects.delete', privateProjectId, ownerCookie).catch(() => {});
		await collabContext.close();
	});

	// ── UI ────────────────────────────────────────────────────────────────────

	test('usuario B no ve el proyecto privado de A en su lista', async () => {
		const page = await collabContext.newPage();
		await loginAsCollaborator(page);

		await page.goto('/projects');
		await expect(page.getByText('_test-private-project')).not.toBeVisible();
		await page.close();
	});

	test('usuario B navegando directamente a la URL del proyecto → redirige', async () => {
		const page = await collabContext.newPage();
		await page.goto(`/projects/${privateProjectId}`);

		// RLS lanza NOT_FOUND en el page load → SvelteKit redirige a /projects
		await expect(page).not.toHaveURL(`/projects/${privateProjectId}`);
		await page.close();
	});

	test('usuario B navegando a la URL del documento → redirige', async () => {
		const page = await collabContext.newPage();
		await page.goto(`/projects/${privateProjectId}/documents/${privateDocId}`);

		await expect(page).not.toHaveURL(
			`/projects/${privateProjectId}/documents/${privateDocId}`
		);
		await page.close();
	});

	// ── API / tRPC ────────────────────────────────────────────────────────────

	test('usuario B: projects.byId con proyecto ajeno → NOT_FOUND', async () => {
		await expect(
			trpcQuery('projects.byId', privateProjectId, collabCookie)
		).rejects.toThrow('NOT_FOUND');
	});

	test('usuario B: documents.withContent con documento ajeno → NOT_FOUND', async () => {
		await expect(
			trpcQuery('documents.withContent', privateDocId, collabCookie)
		).rejects.toThrow('NOT_FOUND');
	});

	test('usuario B: comments.createGeneral en documento ajeno → error', async () => {
		await expect(
			trpcMutate(
				'comments.createGeneral',
				{ documentId: privateDocId, content: 'Intrusión' },
				collabCookie
			)
		).rejects.toThrow();
	});

	test('usuario B: projects.update con proyecto ajeno → error', async () => {
		await expect(
			trpcMutate(
				'projects.update',
				{ id: privateProjectId, title: 'Hackeado' },
				collabCookie
			)
		).rejects.toThrow();
	});

	test('usuario B: projects.delete con proyecto ajeno → error', async () => {
		await expect(
			trpcMutate('projects.delete', privateProjectId, collabCookie)
		).rejects.toThrow();
	});
});
