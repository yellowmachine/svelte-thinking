#!/usr/bin/env node
/**
 * Ejecuta las migraciones de Drizzle antes de arrancar la app.
 * Corre como MIGRATION_DATABASE_URL (superuser) para tener permisos de CREATE TABLE.
 * El archivo se ejecuta desde el entrypoint.sh antes de iniciar el servidor.
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

const client = postgres(url, { max: 1 });
const db = drizzle(client);

try {
	console.log('Ejecutando migraciones...');
	await migrate(db, { migrationsFolder: './drizzle' });
	console.log('Migraciones completadas.');
} catch (err) {
	console.error('Error en migraciones:', err);
	process.exit(1);
}

// ── Admin seed ──────────────────────────────────────────────────────────────
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
