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

await sql.end();
console.log('Migrations applied successfully');
