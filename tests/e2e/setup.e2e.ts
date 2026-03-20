import { test } from '@playwright/test';
import { createTestUser, TEST_USER } from './helpers/create-test-user';
import { createTestDocument } from './helpers/create-test-document';

// Este archivo corre una sola vez antes del resto de tests (ver playwright.config.ts)
test('preparar datos de test', async () => {
	await createTestUser();
	await createTestDocument(TEST_USER.email, TEST_USER.password);
});
