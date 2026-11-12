import type { SQL } from 'drizzle-orm';
import type { Db } from '$lib/server/db';

/**
 * Runs a raw SQL query and returns its rows. postgres-js (the app) returns them
 * as an array; PGlite (the tests) as `{ rows }`.
 */
export async function rowsOf<T>(db: Db, query: SQL): Promise<T[]> {
	const result = (await db.execute(query)) as unknown as T[] | { rows: T[] };
	return Array.isArray(result) ? result : result.rows;
}
