import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { loginAsTestUser } from './helpers/login';
import { DOC_URL_FILE } from './helpers/create-test-document';

const TEST_CONTENT = 'Contenido de prueba para verificar el guardado.';

function getDocUrl() {
	return readFileSync(DOC_URL_FILE, 'utf-8').trim();
}

test.describe('Guardado de documentos', () => {
	test('botón Guardar persiste el contenido tras recargar', async ({ page }) => {
		await loginAsTestUser(page);
		await page.goto(getDocUrl());

		// Escribir en CodeMirror
		const editor = page.locator('.cm-content');
		await editor.click();
		await page.keyboard.type(TEST_CONTENT);

		// El status cambia a "Cambios sin guardar"
		await expect(page.getByText('Cambios sin guardar')).toBeVisible();

		// Guardar y esperar a que el servidor confirme el draft
		await Promise.all([
			page.waitForResponse((res) => res.url().includes('/api/trpc/') && res.request().method() === 'POST'),
			page.locator('button:has-text("Guardar")').last().click()
		]);

		// Status cambia a "Guardado"
		await expect(page.getByText('Guardado').last()).toBeVisible();

		// Recargar y verificar que el contenido persiste
		await page.reload();
		await page.waitForLoadState('networkidle');

		// Si el draft fue guardado, el servidor lo devuelve y el status es 'pending' (hasDraft: true)
		await expect(page.getByText('Cambios sin guardar')).toBeVisible({ timeout: 8000 });

		// El contenido debe estar en el editor
		await expect(page.locator('.cm-content')).toContainText(TEST_CONTENT, { timeout: 8000 });
	});

	test('botón Guardar está deshabilitado sin cambios', async ({ page }) => {
		await loginAsTestUser(page);
		await page.goto(getDocUrl());

		// Sin editar, el botón Guardar del desktop está disabled
		const saveButton = page.locator('button:has-text("Guardar")').last();
		await expect(saveButton).toBeDisabled();
	});
});
