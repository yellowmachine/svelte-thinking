import { writeFileSync } from 'fs';
import { join } from 'path';
import * as OTPAuth from 'otpauth';
import { readFileSync } from 'fs';

const BASE_URL = 'http://localhost:5175';
export const DOC_URL_FILE = join(import.meta.dirname, '../.test-doc-url');

function headers(extra: Record<string, string> = {}) {
	return { 'Content-Type': 'application/json', Origin: BASE_URL, ...extra };
}

function trpcHeaders(cookie: string) {
	return headers({ Cookie: cookie });
}

async function trpcMutate<T>(procedure: string, input: unknown, cookie: string): Promise<T> {
	const res = await fetch(`${BASE_URL}/api/trpc/${procedure}`, {
		method: 'POST',
		headers: trpcHeaders(cookie),
		body: JSON.stringify({ json: input })
	});
	if (!res.ok) throw new Error(`tRPC ${procedure} failed: ${res.status} ${await res.text()}`);
	const body = await res.json();
	return body.result.data.json as T;
}

/** Extrae pares name=value de uno o varios headers set-cookie */
function parseCookies(setCookie: string | null): string {
	if (!setCookie) return '';
	return setCookie
		.split(',')
		.map((c) => c.trim().split(';')[0].trim())
		.filter(Boolean)
		.join('; ');
}

/**
 * Login via API para un usuario con 2FA activado.
 * Devuelve el Cookie header con la sesión completa.
 */
export async function loginViaApi(email: string, password: string, totpSecret: string): Promise<string> {
	// Paso 1: email+password → temp cookie + twoFactorRedirect
	const step1 = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
		method: 'POST',
		headers: headers(),
		body: JSON.stringify({ email, password })
	});
	const tempCookie = parseCookies(step1.headers.get('set-cookie'));

	// Paso 2: verificar TOTP → sesión completa
	const code = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(totpSecret) }).generate();
	const step2 = await fetch(`${BASE_URL}/api/auth/two-factor/verify-totp`, {
		method: 'POST',
		headers: headers({ Cookie: tempCookie }),
		body: JSON.stringify({ code })
	});
	if (!step2.ok) throw new Error(`login TOTP failed: ${step2.status} ${await step2.text()}`);

	// Usar solo la cookie de sesión del paso 2 (la del paso 1 es temporal para 2FA)
	return parseCookies(step2.headers.get('set-cookie'));
}

/**
 * Crea un proyecto + documento de notas via tRPC, guarda la URL en .test-doc-url.
 */
export async function createTestDocument(email: string, password: string) {
	const secret = readFileSync(join(import.meta.dirname, '../.totp-secret'), 'utf-8').trim();
	const cookie = await loginViaApi(email, password, secret);

	const project = await trpcMutate<{ id: string }>(
		'projects.create',
		{ title: '_test-save' },
		cookie
	);

	const doc = await trpcMutate<{ id: string }>(
		'documents.create',
		{ projectId: project.id, title: 'Nota de test', type: 'notes' },
		cookie
	);

	const url = `/projects/${project.id}/documents/${doc.id}`;
	writeFileSync(DOC_URL_FILE, url, 'utf-8');
}
