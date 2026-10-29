#!/usr/bin/env node
/**
 * Levanta la base de datos y aplica las migraciones de Drizzle. Lo ejecuta
 * entrypoint.sh antes de arrancar la app, y `bun run db:migrate` en dev/test.
 *
 * Corre como MIGRATION_DATABASE_URL (el dueño de la base, superuser en el
 * Postgres del compose) y es idempotente, así que sirve igual sobre una base
 * vacía que en cada redeploy:
 *
 * 1. Prepara lo que las migraciones dan por hecho: la extensión pgvector, el
 *    schema `scholio` y el rol de la app (APP_DB_USER/APP_DB_PASSWORD), que no
 *    es superuser ni dueño de las tablas para que RLS se le aplique siempre.
 * 2. Aplica las migraciones (tablas de Better Auth en public, el resto en scholio).
 * 3. Da al rol de la app permisos sobre lo que haya creado.
 * 4. Siembra el admin (ADMIN_EMAIL/ADMIN_PASSWORD) si están definidos.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { hashPassword } from '../node_modules/better-auth/dist/crypto/password.mjs';

const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
	console.error('Error: MIGRATION_DATABASE_URL o DATABASE_URL no definida');
	process.exit(1);
}

const appUser = process.env.APP_DB_USER ?? 'scholio_app';
const appPassword = process.env.APP_DB_PASSWORD;
if (!/^[a-z_][a-z0-9_]*$/.test(appUser)) {
	console.error(`Error: APP_DB_USER "${appUser}" no es un nombre de rol válido`);
	process.exit(1);
}

const client = postgres(url, {
	max: 1,
	// Las tablas de Better Auth van sin schema en las migraciones: que caigan en public.
	connection: { search_path: 'public,scholio' },
	onnotice: () => {}
});

/** Literal SQL entre comillas simples, para lo que no admite parámetros (CREATE ROLE). */
const literal = (value) => `'${value.replaceAll("'", "''")}'`;

// ── 1. Lo previo a las migraciones ──────────────────────────────────────────
await client`CREATE EXTENSION IF NOT EXISTS vector`;
await client`CREATE SCHEMA IF NOT EXISTS scholio`;

const [{ exists: roleExisted }] =
	await client`SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${appUser}) AS exists`;
if (!roleExisted && appPassword) {
	console.log(`Creando el rol "${appUser}"...`);
	await client.unsafe(`CREATE ROLE "${appUser}" WITH LOGIN PASSWORD ${literal(appPassword)}`);
}
// Sin rol ni contraseña para crearlo, se migra igual pero sin permisos: la app
// no podrá conectarse como ese rol hasta que exista.
const hasAppRole = roleExisted || !!appPassword;
if (!hasAppRole)
	console.warn(`Aviso: el rol "${appUser}" no existe y falta APP_DB_PASSWORD; no se crea`);

const [{ db: dbName }] = await client`SELECT current_database() AS db`;
if (hasAppRole) {
	await client.unsafe(`GRANT CONNECT ON DATABASE "${dbName}" TO "${appUser}"`);
	await client.unsafe(`ALTER ROLE "${appUser}" SET search_path = scholio, public`);
}
for (const schema of hasAppRole ? ['public', 'scholio'] : []) {
	await client.unsafe(`GRANT USAGE ON SCHEMA ${schema} TO "${appUser}"`);
	await client.unsafe(
		`ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${appUser}"`
	);
	await client.unsafe(
		`ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO "${appUser}"`
	);
	await client.unsafe(
		`ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT EXECUTE ON FUNCTIONS TO "${appUser}"`
	);
}

// ── 2. Migraciones ──────────────────────────────────────────────────────────
try {
	console.log('Ejecutando migraciones...');
	await migrate(drizzle(client), { migrationsFolder: './drizzle' });
	console.log('Migraciones completadas.');
} catch (err) {
	console.error('Error en migraciones:', err);
	process.exit(1);
}

// ── 3. Permisos sobre lo ya creado ──────────────────────────────────────────
// Los default privileges solo cubren lo que cree este mismo rol; esto cubre el resto.
for (const schema of hasAppRole ? ['public', 'scholio'] : []) {
	await client.unsafe(
		`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schema} TO "${appUser}"`
	);
	await client.unsafe(
		`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA ${schema} TO "${appUser}"`
	);
}

// ── 4. Admin seed ───────────────────────────────────────────────────────────
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;

if (adminEmail && adminPassword) {
	console.log(`Seeding admin user: ${adminEmail}`);

	const adminId = crypto.randomUUID();
	const hashedPassword = await hashPassword(adminPassword);
	const now = new Date().toISOString();

	await client`
		INSERT INTO scholio.waitlist (id, email, name, status, created_at)
		VALUES (${crypto.randomUUID()}, ${adminEmail}, 'Admin', 'approved', ${now})
		ON CONFLICT (email) DO NOTHING
	`;

	await client`
		INSERT INTO public.user (id, name, email, email_verified, created_at, updated_at)
		VALUES (${adminId}, 'Admin', ${adminEmail}, true, ${now}, ${now})
		ON CONFLICT (email) DO NOTHING
	`;

	const [{ id: userId }] =
		await client`SELECT id FROM public.user WHERE email = ${adminEmail} LIMIT 1`;

	await client`DELETE FROM public.account WHERE user_id = ${userId} AND provider_id = 'credential'`;
	await client`
		INSERT INTO public.account (id, account_id, provider_id, user_id, password, created_at, updated_at)
		VALUES (${crypto.randomUUID()}, ${userId}, 'credential', ${userId}, ${hashedPassword}, ${now}, ${now})
	`;

	await client`
		INSERT INTO scholio.user_profile (id, user_id, created_at, updated_at)
		VALUES (${crypto.randomUUID()}, ${userId}, ${now}, ${now})
		ON CONFLICT (user_id) DO NOTHING
	`;

	console.log('Admin user seeded successfully');
} else {
	console.log('ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin seed');
}

await client.end();
