import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { loginAsTestUser } from './helpers/login';
import { TEST_USER } from './helpers/create-test-user';
import { COLLABORATOR_USER } from './helpers/create-collaborator';
import { trpcMutate, loginViaApi, loginViaApiNo2FA } from './helpers/create-test-document';
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
