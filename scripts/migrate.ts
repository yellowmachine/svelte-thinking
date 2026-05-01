/**
 * Script de migración propio que:
 * 1. Configura search_path = public, scholio para que las tablas de better-auth
 *    (sin schema prefix) se creen en public, no en scholio.
 * 2. Crea la extensión pgvector si no existe.
 * 3. Aplica las migraciones de Drizzle con postgres-js.
 *
 * Funciona igual en dev y producción — solo cambia MIGRATION_DATABASE_URL.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
// @ts-expect-error — no types for this internal export
import { hashPassword } from '../node_modules/better-auth/dist/crypto/password.mjs';

const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error('MIGRATION_DATABASE_URL or DATABASE_URL must be set');

const sql = postgres(url, {
	max: 1,
	// Establece search_path para cada conexión antes de cualquier query
	connection: {
		search_path: 'public,scholio'
	}
});

// pgvector requiere superuser — se ejecuta antes del migrate
await sql`CREATE EXTENSION IF NOT EXISTS vector`;

const db = drizzle(sql);
await migrate(db, { migrationsFolder: './drizzle' });

console.log('Migrations applied successfully');

// ── Post-migrate grants ──────────────────────────────────────────────────────
// Idempotent — safe to run on every migrate (fresh or incremental).
// MIGRATION_DATABASE_URL connects as superuser so GRANT/ALTER DEFAULT PRIVILEGES work.
const appUser = process.env.APP_DB_USER;
if (appUser) {
	console.log(`Granting scholio schema privileges to "${appUser}"...`);
	await sql.unsafe(`GRANT USAGE ON SCHEMA scholio TO "${appUser}"`);
	await sql.unsafe(
		`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA scholio TO "${appUser}"`
	);
	await sql.unsafe(
		`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA scholio TO "${appUser}"`
	);
	await sql.unsafe(
		`ALTER DEFAULT PRIVILEGES IN SCHEMA scholio GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${appUser}"`
	);
	await sql.unsafe(
		`ALTER DEFAULT PRIVILEGES IN SCHEMA scholio GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO "${appUser}"`
	);
	await sql.unsafe(
		`ALTER DEFAULT PRIVILEGES IN SCHEMA scholio GRANT EXECUTE ON FUNCTIONS TO "${appUser}"`
	);
	console.log('Grants applied');
} else {
	console.log('APP_DB_USER not set — skipping scholio grants');
}

// ── Admin seed ──────────────────────────────────────────────────────────────
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;

if (adminEmail && adminPassword) {
	console.log(`Seeding admin user: ${adminEmail}`);

	const adminId = crypto.randomUUID();
	const hashedPassword = await hashPassword(adminPassword);
	const now = new Date().toISOString();

	// 1. waitlist — approved so registration flow is satisfied
	await sql`
		INSERT INTO scholio.waitlist (id, email, name, status, created_at)
		VALUES (${crypto.randomUUID()}, ${adminEmail}, 'Admin', 'approved', ${now})
		ON CONFLICT (email) DO NOTHING
	`;

	// 2. public.user
	await sql`
		INSERT INTO public.user (id, name, email, email_verified, created_at, updated_at)
		VALUES (${adminId}, 'Admin', ${adminEmail}, true, ${now}, ${now})
		ON CONFLICT (email) DO NOTHING
	`;

	// Recover actual id in case row already existed
	const [{ id: userId }] = await sql<{ id: string }[]>`
		SELECT id FROM public.user WHERE email = ${adminEmail} LIMIT 1
	`;

	// 3. public.account (credential provider)
	// No unique constraint on (user_id, provider_id) — delete existing first to avoid duplicates
	await sql`DELETE FROM public.account WHERE user_id = ${userId} AND provider_id = 'credential'`;
	await sql`
		INSERT INTO public.account (id, account_id, provider_id, user_id, password, created_at, updated_at)
		VALUES (${crypto.randomUUID()}, ${userId}, 'credential', ${userId}, ${hashedPassword}, ${now}, ${now})
	`;

	// 4. scholio.user_profile
	await sql`
		INSERT INTO scholio.user_profile (id, user_id, created_at, updated_at)
		VALUES (${crypto.randomUUID()}, ${userId}, ${now}, ${now})
		ON CONFLICT (user_id) DO NOTHING
	`;

	console.log('Admin user seeded successfully');
} else {
	console.log('ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin seed');
}

await sql.end();
