#!/usr/bin/env node
/**
 * Ejecuta las migraciones de Drizzle antes de arrancar la app.
 * Corre como MIGRATION_DATABASE_URL (superuser) para tener permisos de CREATE TABLE.
 * El archivo se ejecuta desde el entrypoint.sh antes de iniciar el servidor.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

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
} finally {
	await client.end();
}
