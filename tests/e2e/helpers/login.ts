import type { Page } from '@playwright/test';
import { generateTotpCode, TEST_USER } from './create-test-user';

export async function loginAsTestUser(page: Page) {
	await page.goto('/login');
	await page.fill('input[name="email"]', TEST_USER.email);
	await page.fill('input[name="password"]', TEST_USER.password);
	await page.click('button[type="submit"]');

	// Paso 2FA
	await page.getByRole('heading', { name: 'Verificación en dos pasos' }).waitFor();
	await page.fill('input[name="code"]', generateTotpCode());
	await page.click('button[type="submit"]');

	await page.waitForURL('/projects');
}
