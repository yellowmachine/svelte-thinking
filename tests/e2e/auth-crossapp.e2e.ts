/**
 * Cross-app identity tests: Scholio ↔ Librarian shared public.user table.
 *
 * These tests cover the most critical identity flows: a user that exists in
 * public.user (from Librarian or another app) but has no scholio.user_profile.
 *
 * Run order matters — cases 1→4 are sequential and share the same DB state.
 * Case 5 is independent.
 */
import { test, expect } from '@playwright/test';
import postgres from 'postgres';
import { randomUUID } from 'crypto';

const BASE_URL = 'http://localhost:5175';
const TEST_DB_URL = 'postgres://scholarly:scholarly_test@localhost:5434/scholio_test';

// ── Librarian user (exists in public.user, no scholio.user_profile) ──────────
const LIBRARIAN_USER = {
	email: 'librarian-crossapp@scholio.test',
	password: 'LibrarianTest1234!',
	name: 'Librarian Tester'
};

// ── Fresh Scholio user (no prior account anywhere) ────────────────────────────
const NEW_SCHOLIO_USER = {
	email: 'new-scholio-crossapp@scholio.test',
	password: 'NewScholio1234!',
	name: 'New Scholio User'
};

function headers(extra: Record<string, string> = {}) {
	return { 'Content-Type': 'application/json', Origin: BASE_URL, ...extra };
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function seedLibrarianUser() {
	// Simulate a Librarian-originated account: exists in public.user, no scholio.user_profile.
	// We use the real sign-up endpoint (which creates public.user) and then delete the profile
	// that the hook would normally create — but since profile creation happens at /register,
	// simply signing up without going through /register leaves no profile.
	const res = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
		method: 'POST',
		headers: headers(),
		body: JSON.stringify({
			email: LIBRARIAN_USER.email,
			password: LIBRARIAN_USER.password,
			name: LIBRARIAN_USER.name
		})
	});
	// 422 = already exists, fine
	if (!res.ok && res.status !== 422) {
		throw new Error(`seedLibrarianUser signup failed: ${res.status} ${await res.text()}`);
	}

	const sql = postgres(TEST_DB_URL);
	// Mark email verified so login works
	await sql`UPDATE "user" SET email_verified = true WHERE email = ${LIBRARIAN_USER.email}`;
	// Ensure no scholio.user_profile exists (simulates pure Librarian account)
	await sql`
		DELETE FROM scholio.user_profile
		WHERE user_id = (SELECT id FROM "user" WHERE email = ${LIBRARIAN_USER.email})
	`;
	await sql.end();
}

async function cleanupLibrarianUser() {
	const sql = postgres(TEST_DB_URL);
	await sql`
		DELETE FROM scholio.user_profile
		WHERE user_id = (SELECT id FROM "user" WHERE email = ${LIBRARIAN_USER.email})
	`;
	await sql`
		DELETE FROM scholio.waitlist WHERE email = ${LIBRARIAN_USER.email}
	`;
	await sql.end();
}

async function cleanupNewScholioUser() {
	const sql = postgres(TEST_DB_URL);
	await sql`
		DELETE FROM scholio.user_profile
		WHERE user_id = (SELECT id FROM "user" WHERE email = ${NEW_SCHOLIO_USER.email})
	`;
	await sql`
		DELETE FROM scholio.waitlist WHERE email = ${NEW_SCHOLIO_USER.email}
	`;
	await sql`DELETE FROM "user" WHERE email = ${NEW_SCHOLIO_USER.email}`;
	await sql.end();
}

async function createWaitlistToken(email: string, name: string): Promise<string> {
	const token = randomUUID();
	const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour from now
	const sql = postgres(TEST_DB_URL);

	// Upsert: insert if not exists, otherwise update to approved with token
	const existing = await sql`SELECT id FROM scholio.waitlist WHERE email = ${email} LIMIT 1`;
	if (existing[0]) {
		await sql`
			UPDATE scholio.waitlist
			SET status = 'approved', registration_token = ${token}, token_expires_at = ${expiresAt}
			WHERE email = ${email}
		`;
	} else {
		await sql`
			INSERT INTO scholio.waitlist (id, email, name, status, registration_token, token_expires_at)
			VALUES (${randomUUID()}, ${email}, ${name}, 'approved', ${token}, ${expiresAt})
		`;
	}
	await sql.end();
	return token;
}

async function profileExists(email: string): Promise<boolean> {
	const sql = postgres(TEST_DB_URL);
	const rows = await sql`
		SELECT up.id FROM scholio.user_profile up
		JOIN "user" u ON u.id = up.user_id
		WHERE u.email = ${email}
		LIMIT 1
	`;
	await sql.end();
	return rows.length > 0;
}

async function waitlistTokenIsInvalidated(email: string): Promise<boolean> {
	const sql = postgres(TEST_DB_URL);
	const rows = await sql`
		SELECT registration_token FROM scholio.waitlist WHERE email = ${email} LIMIT 1
	`;
	await sql.end();
	return rows.length > 0 && rows[0].registration_token === null;
}

// ── Tests: Librarian user flow (cases 1→4 sequential) ────────────────────────

test.describe('Librarian user → Scholio cross-app flow', () => {
	test.beforeAll(async () => {
		await seedLibrarianUser();
	});

	test.afterAll(async () => {
		await cleanupLibrarianUser();
	});

	// Case 1
	test('Librarian user logging in is redirected to /no-access, not /projects', async ({ page }) => {
		await page.goto('/login');
		await page.fill('input[name="email"]', LIBRARIAN_USER.email);
		await page.fill('input[name="password"]', LIBRARIAN_USER.password);
		await page.click('button[type="submit"]');

		// No 2FA for this user — should land at /no-access
		await page.waitForURL('**/no-access', { timeout: 8000 });
		await expect(page).toHaveURL(/\/no-access/);
		await expect(page).not.toHaveURL(/\/projects/);
	});

	// Case 2
	test('Librarian user submits waitlist from /no-access with pre-filled email', async ({ page }) => {
		await page.goto('/login');
		await page.fill('input[name="email"]', LIBRARIAN_USER.email);
		await page.fill('input[name="password"]', LIBRARIAN_USER.password);
		await page.click('button[type="submit"]');
		await page.waitForURL('**/no-access', { timeout: 8000 });

		// Email field should be pre-filled from server (locals.user.email)
		const emailField = page.getByRole('textbox', { name: /email/i });
		await expect(emailField).toHaveValue(LIBRARIAN_USER.email);

		// Fill name and submit
		const nameField = page.getByRole('textbox', { name: /name/i });
		await nameField.fill(LIBRARIAN_USER.name);
		await page.getByRole('button', { name: /request access/i }).click();

		// Success state shown
		await expect(page.getByText(/waitlist|access|received|request/i)).toBeVisible({ timeout: 5000 });

		// Verify record is in DB with the Librarian note
		const sql = postgres(TEST_DB_URL);
		const rows = await sql`
			SELECT message FROM scholio.waitlist WHERE email = ${LIBRARIAN_USER.email} LIMIT 1
		`;
		await sql.end();
		expect(rows[0]).toBeTruthy();
		expect(rows[0].message).toContain('Librarian');
	});

	// Case 3
	test('Registration link with existing email creates user_profile and invalidates token', async ({ page }) => {
		const token = await createWaitlistToken(LIBRARIAN_USER.email, LIBRARIAN_USER.name);

		await page.goto(`/register?token=${token}`);

		// Form should be pre-filled with email from waitlist
		await expect(page.locator('input[name="email"]')).toHaveValue(LIBRARIAN_USER.email);

		// Fill password and submit
		await page.fill('input[name="name"]', LIBRARIAN_USER.name);
		await page.fill('input[name="password"]', LIBRARIAN_USER.password);
		await page.getByRole('button', { name: 'Create account' }).click();

		// Should redirect to /login?welcome=1 (email already existed)
		await page.waitForURL('**/login**', { timeout: 8000 });
		expect(page.url()).toContain('welcome=1');

		// scholio.user_profile must now exist
		expect(await profileExists(LIBRARIAN_USER.email)).toBe(true);

		// Token must be invalidated
		expect(await waitlistTokenIsInvalidated(LIBRARIAN_USER.email)).toBe(true);
	});

	// Case 4
	test('Login after cross-app registration shows welcome message and reaches /projects', async ({ page }) => {
		await page.goto(`/login?welcome=1&email=${encodeURIComponent(LIBRARIAN_USER.email)}`);

		// Welcome message visible
		await expect(page.getByText('Your Scholio access is ready. Sign in with your credentials.')).toBeVisible();

		// Email pre-filled
		await expect(page.locator('input[name="email"]')).toHaveValue(LIBRARIAN_USER.email);

		await page.fill('input[name="password"]', LIBRARIAN_USER.password);
		await page.click('button[type="submit"]');

		// No 2FA — lands at /projects
		await page.waitForURL('**/projects', { timeout: 8000 });
		await expect(page).toHaveURL(/\/projects/);
	});
});

// ── Test: Brand new Scholio user (case 5, independent) ───────────────────────

test.describe('New Scholio user — full waitlist → register → login flow', () => {
	test.afterAll(async () => {
		await cleanupNewScholioUser();
	});

	test('Full flow: waitlist → approval token → register → login → /projects', async ({ page }) => {
		// Step 1: submit waitlist from landing page
		await page.goto('/');
		await page.fill('input[name="name"]', NEW_SCHOLIO_USER.name);
		await page.fill('input[name="email"]', NEW_SCHOLIO_USER.email);
		await page.getByRole('button', { name: /request access/i }).click();

		await expect(page.getByText(/request received|received|waitlist/i)).toBeVisible({ timeout: 5000 });

		// Step 2: simulate admin approval — create token directly in DB
		const token = await createWaitlistToken(NEW_SCHOLIO_USER.email, NEW_SCHOLIO_USER.name);

		// Step 3: navigate to registration link
		await page.goto(`/register?token=${token}`);
		await expect(page.locator('input[name="email"]')).toHaveValue(NEW_SCHOLIO_USER.email);

		await page.fill('input[name="name"]', NEW_SCHOLIO_USER.name);
		await page.fill('input[name="password"]', NEW_SCHOLIO_USER.password);
		await page.getByRole('button', { name: 'Create account' }).click();

		// New user → goes to /check-email (email verification)
		await page.waitForURL('**/check-email**', { timeout: 8000 });

		// Manually verify email in DB
		const sql = postgres(TEST_DB_URL);
		await sql`UPDATE "user" SET email_verified = true WHERE email = ${NEW_SCHOLIO_USER.email}`;
		await sql.end();

		// user_profile must exist
		expect(await profileExists(NEW_SCHOLIO_USER.email)).toBe(true);

		// Token invalidated
		expect(await waitlistTokenIsInvalidated(NEW_SCHOLIO_USER.email)).toBe(true);

		// Step 4: login and reach /projects
		await page.goto('/login');
		await page.fill('input[name="email"]', NEW_SCHOLIO_USER.email);
		await page.fill('input[name="password"]', NEW_SCHOLIO_USER.password);
		await page.click('button[type="submit"]');

		await page.waitForURL('**/projects', { timeout: 8000 });
		await expect(page).toHaveURL(/\/projects/);
	});
});
