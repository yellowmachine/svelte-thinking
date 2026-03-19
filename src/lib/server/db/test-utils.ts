/**
 * Test utilities for RLS testing with PGlite.
 *
 * PGlite runs real PostgreSQL in-process (WASM). The default connection is a
 * superuser, which bypasses RLS regardless of FORCE ROW LEVEL SECURITY.
 *
 * Solution: create a non-superuser role `app_user` after migrations, then use
 * `SET LOCAL ROLE app_user` inside each transaction so RLS policies apply.
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { sql } from 'drizzle-orm';
import * as schema from './schema';
import { appRouter } from '$lib/server/trpc';

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

export async function createTestDb(): Promise<TestDb> {
	const client = new PGlite();
	const db = drizzle(client, { schema });

	// Run all Drizzle migrations (as superuser)
	await migrate(db, { migrationsFolder: './drizzle' });

	// Create a non-superuser role that mirrors the production `scholarly_app` role.
	// RLS applies to this role (not to the superuser).
	await db.execute(sql`CREATE ROLE app_user`);
	await db.execute(sql`GRANT USAGE ON SCHEMA public TO app_user`);
	await db.execute(sql`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user`);
	await db.execute(sql`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user`);

	return db;
}

/**
 * Executes `fn` inside a transaction where:
 * - The current role is the non-superuser `app_user` (RLS applies)
 * - `app.current_user_id` is set to `userId` (policies use this to filter rows)
 */
export async function asUser<T>(
	db: TestDb,
	userId: string,
	fn: (tx: TestDb) => Promise<T>
): Promise<T> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`SET LOCAL ROLE app_user`);
		await tx.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
		return fn(tx as unknown as TestDb);
	});
}

/**
 * Creates a tRPC caller bound to a test database and a specific user.
 *
 * `withRLS` mirrors the production implementation in hooks.server.ts but also
 * does `SET LOCAL ROLE app_user` so RLS policies are enforced in PGlite.
 */
export function createTestCaller(db: TestDb, userId: string) {
	const withRLS = <T>(fn: (tx: TestDb) => Promise<T>): Promise<T> =>
		db.transaction(async (tx) => {
			await tx.execute(sql`SET LOCAL ROLE app_user`);
			await tx.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
			return fn(tx as unknown as TestDb);
		});

	return appRouter.createCaller({
		db: db as never,
		user: { id: userId, name: userId, email: `${userId}@test.com` } as never,
		session: null as never,
		withRLS: withRLS as never,
		event: null as never
	});
}

/**
 * Executes `fn` with no user context (simulates unauthenticated request).
 * `app.current_user_id` is empty — policies that check IS NOT NULL will block.
 */
export async function asAnon<T>(db: TestDb, fn: (tx: TestDb) => Promise<T>): Promise<T> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`SET LOCAL ROLE app_user`);
		await tx.execute(sql`SELECT set_config('app.current_user_id', '', true)`);
		return fn(tx as unknown as TestDb);
	});
}
