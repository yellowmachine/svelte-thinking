import { describe, it, expect, beforeAll } from 'vitest';
import { eq, and, gt } from 'drizzle-orm';
import { createTestDb, type TestDb } from '$lib/server/db/test-utils';
import { waitlist } from '$lib/server/db/schemas/waitlist.schema';

// ── Fixtures ──────────────────────────────────────────────────────────────────

let db: TestDb;

beforeAll(async () => {
	db = await createTestDb();
}, 30_000);

// ── Helpers que replican la lógica del server ─────────────────────────────────

async function joinWaitlist(db: TestDb, data: { email: string; name: string }) {
	const existing = await db
		.select({ id: waitlist.id })
		.from(waitlist)
		.where(eq(waitlist.email, data.email))
		.limit(1);

	if (existing[0]) return { ok: false, error: 'duplicate' as const };

	const [row] = await db
		.insert(waitlist)
		.values({ id: crypto.randomUUID(), email: data.email, name: data.name })
		.returning();

	return { ok: true, id: row.id };
}

async function approveEntry(db: TestDb, id: string) {
	const token = crypto.randomUUID();
	const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

	const [row] = await db
		.update(waitlist)
		.set({ status: 'approved', registrationToken: token, tokenExpiresAt: expiresAt })
		.where(eq(waitlist.id, id))
		.returning({ email: waitlist.email });

	return { token, email: row?.email };
}

async function validateToken(db: TestDb, token: string) {
	const [row] = await db
		.select({ id: waitlist.id, email: waitlist.email })
		.from(waitlist)
		.where(
			and(
				eq(waitlist.registrationToken, token),
				eq(waitlist.status, 'approved'),
				gt(waitlist.tokenExpiresAt, new Date())
			)
		)
		.limit(1);

	return row ?? null;
}

async function consumeToken(db: TestDb, id: string) {
	await db
		.update(waitlist)
		.set({ registrationToken: null, tokenExpiresAt: null })
		.where(eq(waitlist.id, id));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('waitlist: join', () => {
	it('insertar una nueva solicitud funciona', async () => {
		const result = await joinWaitlist(db, { email: 'ana@test.com', name: 'Ana' });
		expect(result.ok).toBe(true);
	});

	it('email duplicado es rechazado', async () => {
		await joinWaitlist(db, { email: 'bob@test.com', name: 'Bob' });
		const second = await joinWaitlist(db, { email: 'bob@test.com', name: 'Bob 2' });
		expect(second.ok).toBe(false);
		expect(second.error).toBe('duplicate');
	});

	it('estado inicial es pending', async () => {
		await joinWaitlist(db, { email: 'carlos@test.com', name: 'Carlos' });
		const [row] = await db
			.select({ status: waitlist.status })
			.from(waitlist)
			.where(eq(waitlist.email, 'carlos@test.com'));

		expect(row.status).toBe('pending');
	});
});

describe('waitlist: approve y validación de token', () => {
	let entryId: string;
	let token: string;

	beforeAll(async () => {
		const result = await joinWaitlist(db, { email: 'diana@test.com', name: 'Diana' });
		if (!result.ok) throw new Error('Setup failed');
		entryId = result.id!;
	});

	it('aprobar genera un token y cambia el estado', async () => {
		const result = await approveEntry(db, entryId);
		token = result.token;

		const [row] = await db
			.select({ status: waitlist.status, registrationToken: waitlist.registrationToken })
			.from(waitlist)
			.where(eq(waitlist.id, entryId));

		expect(row.status).toBe('approved');
		expect(row.registrationToken).toBe(token);
	});

	it('token válido se puede validar', async () => {
		const row = await validateToken(db, token);
		expect(row).not.toBeNull();
		expect(row!.email).toBe('diana@test.com');
	});

	it('token inexistente no es válido', async () => {
		const row = await validateToken(db, crypto.randomUUID());
		expect(row).toBeNull();
	});

	it('consumir el token lo invalida para usos futuros', async () => {
		await consumeToken(db, entryId);
		const row = await validateToken(db, token);
		expect(row).toBeNull();
	});
});

describe('waitlist: token expirado', () => {
	it('token expirado no pasa validación', async () => {
		const { ok, id } = await joinWaitlist(db, { email: 'expired@test.com', name: 'Expired' }) as { ok: true; id: string };
		expect(ok).toBe(true);

		const expiredToken = crypto.randomUUID();
		const pastDate = new Date(Date.now() - 1000); // ya expiró

		await db
			.update(waitlist)
			.set({ status: 'approved', registrationToken: expiredToken, tokenExpiresAt: pastDate })
			.where(eq(waitlist.id, id));

		const row = await validateToken(db, expiredToken);
		expect(row).toBeNull();
	});
});
