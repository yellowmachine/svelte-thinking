import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, asUser, asAnon, type TestDb } from './db/test-utils';
import { notificationRecipients, unsubscribeByToken, orgAiKeys } from './definerFunctions';
import { user } from './db/auth.schema';
import { project, projectCollaborator } from './db/schemas/projects.schema';
import { notificationPreference } from './db/schemas/users.schema';
import {
	organization,
	organizationMember,
	organizationApiKey
} from './db/schemas/organizations.schema';
import type { Db } from './db';

const OWNER = 'owner';
const COAUTHOR = 'coauthor';
const REVIEWER = 'reviewer';
const STRANGER = 'stranger';
const P = 'p-1';

let db: TestDb;
// The wrappers take the app's Db type; PGlite's drizzle instance is call-compatible.
const asDb = (tx: TestDb) => tx as unknown as Db;

beforeAll(async () => {
	db = await createTestDb();

	// Seeded as superuser, bypassing RLS.
	await db
		.insert(user)
		.values(
			[OWNER, COAUTHOR, REVIEWER, STRANGER].map((id) => ({ id, name: id, email: `${id}@test.com` }))
		);
	await db.insert(project).values({ id: P, title: 'Paper', ownerId: OWNER });
	await db.insert(projectCollaborator).values([
		{ id: 'c-o', projectId: P, userId: OWNER, ownerUserId: OWNER, role: 'owner' },
		{ id: 'c-a', projectId: P, userId: COAUTHOR, ownerUserId: OWNER, role: 'coauthor' },
		{ id: 'c-r', projectId: P, userId: REVIEWER, ownerUserId: OWNER, role: 'reviewer' }
	]);
	await db.insert(organization).values({ id: 'org', name: 'Lab', slug: 'lab', ownerId: OWNER });
	await db.insert(organizationMember).values({
		id: 'm-1',
		orgId: 'org',
		userId: COAUTHOR,
		orgOwnerId: OWNER
	});
	await db.insert(organizationApiKey).values([
		{
			id: 'k-on',
			orgId: 'org',
			name: 'on',
			encryptedApiKey: 'a',
			encryptedDataKey: '',
			iv: 'b',
			authTag: 'c'
		},
		{
			id: 'k-off',
			orgId: 'org',
			name: 'off',
			encryptedApiKey: 'a',
			encryptedDataKey: '',
			iv: 'b',
			authTag: 'c',
			enabled: false
		}
	]);
}, 30_000);

describe('notification_recipients', () => {
	it('gives a member the other members, with emails and fresh preferences', async () => {
		const rows = await asUser(db, COAUTHOR, (tx) => notificationRecipients(asDb(tx), P, false));

		expect(rows.map((r) => r.userId).sort()).toEqual([OWNER, REVIEWER]);
		expect(rows.find((r) => r.userId === OWNER)?.email).toBe('owner@test.com');
		expect(rows.every((r) => r.commentEmails && r.commitEmails && r.unsubscribeToken)).toBe(true);
	});

	it('keeps the same preference (and token) on later calls', async () => {
		const first = await asUser(db, REVIEWER, (tx) => notificationRecipients(asDb(tx), P, true));
		const again = await asUser(db, COAUTHOR, (tx) => notificationRecipients(asDb(tx), P, true));
		expect(first).toHaveLength(1);
		expect(again[0].unsubscribeToken).toBe(first[0].unsubscribeToken);
	});

	it('leaves the caller out: the owner gets nobody when only the owner is asked for', async () => {
		const rows = await asUser(db, OWNER, (tx) => notificationRecipients(asDb(tx), P, true));
		expect(rows).toHaveLength(0);
	});

	it('gives nothing to non-members or without a user', async () => {
		expect(
			await asUser(db, STRANGER, (tx) => notificationRecipients(asDb(tx), P, false))
		).toHaveLength(0);
		expect(await asAnon(db, (tx) => notificationRecipients(asDb(tx), P, false))).toHaveLength(0);
	});
});

describe('unsubscribe_by_token', () => {
	it('turns off both kinds of email from a logged-out link, once', async () => {
		const [pref] = await db
			.select()
			.from(notificationPreference)
			.where(eq(notificationPreference.userId, OWNER));

		expect(await asAnon(db, (tx) => unsubscribeByToken(asDb(tx), pref.unsubscribeToken))).toBe(
			'unsubscribed'
		);
		expect(await asAnon(db, (tx) => unsubscribeByToken(asDb(tx), pref.unsubscribeToken))).toBe(
			'already'
		);
		expect(await asAnon(db, (tx) => unsubscribeByToken(asDb(tx), 'nope'))).toBe('invalid');

		const [after] = await db
			.select()
			.from(notificationPreference)
			.where(eq(notificationPreference.id, pref.id));
		expect(after.commentEmails).toBe(false);
		expect(after.commitEmails).toBe(false);
	});
});

describe('org_ai_keys', () => {
	it('gives members and the owner the enabled keys only', async () => {
		const member = await asUser(db, COAUTHOR, (tx) => orgAiKeys(asDb(tx), 'org'));
		const owner = await asUser(db, OWNER, (tx) => orgAiKeys(asDb(tx), 'org'));
		expect(member.map((k) => k.id)).toEqual(['k-on']);
		expect(owner.map((k) => k.id)).toEqual(['k-on']);
		expect(member[0]).toMatchObject({ encryptedApiKey: 'a', iv: 'b', authTag: 'c' });
	});

	it('gives nothing to outsiders', async () => {
		expect(await asUser(db, STRANGER, (tx) => orgAiKeys(asDb(tx), 'org'))).toHaveLength(0);
		expect(await asAnon(db, (tx) => orgAiKeys(asDb(tx), 'org'))).toHaveLength(0);
	});
});
