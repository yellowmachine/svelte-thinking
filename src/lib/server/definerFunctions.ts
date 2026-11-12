/**
 * Typed wrappers for the SECURITY DEFINER functions of migration
 * 0011_rls_definer_functions: the only operations that cross users past RLS.
 * Each function checks the caller itself, from app.current_user_id, so call
 * them on a `withRLS` transaction (unsubscribeByToken works without one).
 */
import { sql } from 'drizzle-orm';
import type { Db } from '$lib/server/db';
import { rowsOf } from '$lib/server/db/rows';

export type NotificationRecipient = {
	userId: string;
	email: string;
	commentEmails: boolean;
	commitEmails: boolean;
	unsubscribeToken: string;
};

/**
 * Members of the project other than the caller (or only its owner), with
 * their notification preference, created if missing. Empty if the caller is
 * not a member.
 */
export async function notificationRecipients(
	tx: Db,
	projectId: string,
	onlyOwner: boolean
): Promise<NotificationRecipient[]> {
	const rows = await rowsOf<{
		user_id: string;
		email: string;
		comment_emails: boolean;
		commit_emails: boolean;
		unsubscribe_token: string;
	}>(tx, sql`SELECT * FROM scholio.notification_recipients(${projectId}, ${onlyOwner})`);
	return rows.map((r) => ({
		userId: r.user_id,
		email: r.email,
		commentEmails: r.comment_emails,
		commitEmails: r.commit_emails,
		unsubscribeToken: r.unsubscribe_token
	}));
}

export type UnsubscribeResult = 'unsubscribed' | 'already' | 'invalid';

/** Turns off comment and commit emails for the preference behind the token. */
export async function unsubscribeByToken(db: Db, token: string): Promise<UnsubscribeResult> {
	const [row] = await rowsOf<{ result: UnsubscribeResult }>(
		db,
		sql`SELECT scholio.unsubscribe_by_token(${token}) AS result`
	);
	return row.result;
}

export type OrgKeyRow = {
	id: string;
	encryptedApiKey: string;
	encryptedDataKey: string;
	iv: string;
	authTag: string;
	enabled: boolean;
};

/** The organization's enabled AI keys. Empty if the caller is neither owner nor member. */
export async function orgAiKeys(tx: Db, orgId: string): Promise<OrgKeyRow[]> {
	const rows = await rowsOf<{
		id: string;
		encrypted_api_key: string;
		encrypted_data_key: string;
		iv: string;
		auth_tag: string;
		enabled: boolean;
	}>(tx, sql`SELECT * FROM scholio.org_ai_keys(${orgId})`);
	return rows.map((r) => ({
		id: r.id,
		encryptedApiKey: r.encrypted_api_key,
		encryptedDataKey: r.encrypted_data_key,
		iv: r.iv,
		authTag: r.auth_tag,
		enabled: r.enabled
	}));
}
