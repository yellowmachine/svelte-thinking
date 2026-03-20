import postgres from 'postgres';
import * as OTPAuth from 'otpauth';
import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

const BASE_URL = 'http://localhost:5175';
const TEST_DB_URL = 'postgres://scholarly:scholarly_test@localhost:5434/scholio_test';
const SECRET_FILE = join(import.meta.dirname, '../.totp-secret');

export const TEST_USER = {
	email: 'test@scholio.test',
	password: 'Test1234!',
	name: 'Test User'
};

export function generateTotpCode(): string {
	const secret = readFileSync(SECRET_FILE, 'utf-8').trim();
	if (!secret) throw new Error('TOTP secret no encontrado — ¿corriste el setup?');
	const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) });
	return totp.generate();
}

function headers(extra: Record<string, string> = {}) {
	return { 'Content-Type': 'application/json', Origin: BASE_URL, ...extra };
}

/**
 * Crea el usuario de test con 2FA activado vía el flujo real de better-auth.
 * Idempotente: si el usuario ya tiene 2FA activado, solo renueva el secreto en memoria.
 */
export async function createTestUser() {
	// 1. Registrar
	const signupRes = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
		method: 'POST',
		headers: headers(),
		body: JSON.stringify({ email: TEST_USER.email, password: TEST_USER.password, name: TEST_USER.name })
	});
	if (!signupRes.ok && signupRes.status !== 422) {
		throw new Error(`signup failed: ${signupRes.status} ${await signupRes.text()}`);
	}

	// 2. Marcar email como verificado en la DB
	const sql = postgres(TEST_DB_URL);
	await sql`UPDATE "user" SET email_verified = true WHERE email = ${TEST_USER.email}`;

	// 3. Resetear 2FA para que el flujo de enable siempre funcione (idempotente)
	await sql`
		DELETE FROM two_factor
		WHERE user_id = (SELECT id FROM "user" WHERE email = ${TEST_USER.email})
	`;
	await sql`UPDATE "user" SET two_factor_enabled = false WHERE email = ${TEST_USER.email}`;
	await sql.end();

	// 4. Login sin 2FA (todavía no está activado o acabamos de crear el usuario)
	const loginRes = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
		method: 'POST',
		headers: headers(),
		body: JSON.stringify({ email: TEST_USER.email, password: TEST_USER.password })
	});
	if (!loginRes.ok) {
		throw new Error(`login failed: ${loginRes.status} ${await loginRes.text()}`);
	}
	const cookie = loginRes.headers.get('set-cookie') ?? '';

	// 5. Activar 2FA — el server devuelve { totpURI, backupCodes }
	const enableRes = await fetch(`${BASE_URL}/api/auth/two-factor/enable`, {
		method: 'POST',
		headers: headers({ Cookie: cookie }),
		body: JSON.stringify({ password: TEST_USER.password })
	});
	if (!enableRes.ok) {
		throw new Error(`enable 2FA failed: ${enableRes.status} ${await enableRes.text()}`);
	}
	const { totpURI } = await enableRes.json();

	// 6. Extraer el secret de la URI  otpauth://totp/...?secret=XXXX&...
	const match = totpURI.match(/secret=([A-Z2-7]+)/i);
	if (!match) throw new Error(`No se pudo extraer el secret de: ${totpURI}`);
	const totpSecret = match[1];
	writeFileSync(SECRET_FILE, totpSecret, 'utf-8');

	// 7. Verificar un código TOTP para confirmar el setup
	const code = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(totpSecret) }).generate();
	const verifyRes = await fetch(`${BASE_URL}/api/auth/two-factor/verify-totp`, {
		method: 'POST',
		headers: headers({ Cookie: cookie }),
		body: JSON.stringify({ code })
	});
	if (!verifyRes.ok) {
		throw new Error(`verify TOTP failed: ${verifyRes.status} ${await verifyRes.text()}`);
	}
}
