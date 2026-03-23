import postgres from 'postgres';

const BASE_URL = 'http://localhost:5175';
const TEST_DB_URL = 'postgres://scholarly:scholarly_test@localhost:5434/scholio_test';

export const COLLABORATOR_USER = {
	email: 'collab@scholio.test',
	password: 'Collab1234!',
	name: 'Test Collaborator'
};

function headers() {
	return { 'Content-Type': 'application/json', Origin: BASE_URL };
}

/**
 * Crea el usuario colaborador sin 2FA. Idempotente.
 */
export async function createCollaboratorUser() {
	const res = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
		method: 'POST',
		headers: headers(),
		body: JSON.stringify({
			email: COLLABORATOR_USER.email,
			password: COLLABORATOR_USER.password,
			name: COLLABORATOR_USER.name
		})
	});
	// 422 = ya existe, se ignora
	if (!res.ok && res.status !== 422) {
		throw new Error(`signup collaborator failed: ${res.status} ${await res.text()}`);
	}

	const sql = postgres(TEST_DB_URL);
	await sql`UPDATE "user" SET email_verified = true WHERE email = ${COLLABORATOR_USER.email}`;
	await sql.end();
}

/** Devuelve el id del usuario colaborador desde la DB de test. */
export async function getCollaboratorUserId(): Promise<string> {
	const sql = postgres(TEST_DB_URL);
	const rows = await sql<{ id: string }[]>`
		SELECT id FROM "user" WHERE email = ${COLLABORATOR_USER.email} LIMIT 1
	`;
	await sql.end();
	if (!rows[0]) throw new Error('Collaborator user not found in DB');
	return rows[0].id;
}
