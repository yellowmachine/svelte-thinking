import { test, expect } from '@playwright/test';
import { generateTotpCode, TEST_USER } from './helpers/create-test-user';

test.describe('Autenticación con 2FA', () => {
	test('login correcto con 2FA', async ({ page }) => {
		await page.goto('/login');
		await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();

		await page.fill('input[name="email"]', TEST_USER.email);
		await page.fill('input[name="password"]', TEST_USER.password);
		await page.click('button[type="submit"]');

		await expect(page.getByRole('heading', { name: 'Verificación en dos pasos' })).toBeVisible();

		await page.fill('input[name="code"]', generateTotpCode());
		await page.click('button[type="submit"]');

		await page.waitForURL('/projects');
		await expect(page).toHaveURL('/projects');
	});

	test('código TOTP incorrecto muestra error', async ({ page }) => {
		await page.goto('/login');

		await page.fill('input[name="email"]', TEST_USER.email);
		await page.fill('input[name="password"]', TEST_USER.password);
		await page.click('button[type="submit"]');

		await expect(page.getByRole('heading', { name: 'Verificación en dos pasos' })).toBeVisible();

		// Código intencionadamente incorrecto
		await page.fill('input[name="code"]', '000000');
		await page.click('button[type="submit"]');

		// Sigue en el paso TOTP con un mensaje de error
		await expect(page.getByRole('heading', { name: 'Verificación en dos pasos' })).toBeVisible();
		await expect(page.locator('p.text-red-700, p.text-red-300')).toBeVisible();
	});

	test('credenciales incorrectas muestran error', async ({ page }) => {
		await page.goto('/login');

		await page.fill('input[name="email"]', TEST_USER.email);
		await page.fill('input[name="password"]', 'wrongpassword');
		await page.click('button[type="submit"]');

		await expect(page.locator('p.text-red-700, p.text-red-300')).toBeVisible();
		// No pasa al paso TOTP
		await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
	});
});
