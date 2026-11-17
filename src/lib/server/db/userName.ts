import { sql, type SQLWrapper } from 'drizzle-orm';

/** Shown in place of the name of an author whose account was deleted. */
export const DELETED_USER_NAME = 'Deleted user';

/**
 * The name of the user `id` points at, or DELETED_USER_NAME once their account
 * is gone: comments, versions and the like outlive their authors. NULL when
 * `id` itself is NULL (no version yet, say), so pass `string | null` as T then.
 */
export const userNameSql = <T extends string | null = string>(id: SQLWrapper) =>
	sql<T>`CASE WHEN ${id} IS NULL THEN NULL
		ELSE COALESCE((SELECT name FROM "user" WHERE "user".id = ${id}), ${DELETED_USER_NAME}) END`;
