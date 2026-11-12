import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, asUser, type TestDb } from './db/test-utils';
import { deleteAccountData } from './accountDeletion';
import { project, projectCollaborator } from './db/schemas/projects.schema';
import { userProfile, userApiKey } from './db/schemas/users.schema';
import { reference, projectReference } from './db/schemas/references.schema';
import { tag } from './db/schemas/tags.schema';

const GONE = 'leaving-user';
const STAYS = 'other-user';

let db: TestDb;

beforeAll(async () => {
	db = await createTestDb();

	// Seeded as superuser, bypassing RLS.
	await db.insert(userProfile).values([
		{ id: GONE, userId: GONE, displayName: 'Leaving' },
		{ id: STAYS, userId: STAYS, displayName: 'Staying' }
	]);
	await db.insert(project).values([
		{ id: 'p-gone', title: 'Mine', ownerId: GONE },
		{ id: 'p-stays', title: 'Theirs', ownerId: STAYS }
	]);
	await db.insert(projectCollaborator).values({
		id: 'c-1',
		projectId: 'p-stays',
		userId: GONE,
		ownerUserId: STAYS,
		role: 'coauthor'
	});
	await db.insert(reference).values([
		{ id: 'r-gone', userId: GONE, citeKey: 'a2020', title: 'A', pdfKey: 'refs/a.pdf' },
		{ id: 'r-stays', userId: STAYS, citeKey: 'b2020', title: 'B' }
	]);
	await db.insert(projectReference).values({ projectId: 'p-stays', referenceId: 'r-gone' });
	await db.insert(tag).values({ id: 't-1', userId: GONE, name: 'tag' });
	await db.insert(userApiKey).values({
		id: 'k-1',
		userId: GONE,
		name: 'key',
		encryptedApiKey: 'x',
		encryptedDataKey: '',
		iv: 'x',
		authTag: 'x'
	});
}, 30_000);

describe('deleteAccountData', () => {
	it('deletes the user data under RLS and leaves other users alone', async () => {
		const result = await asUser(db, GONE, (tx) => deleteAccountData(tx as never, GONE));

		expect(result.deletedProjects).toBe(1);
		expect(result.storageKeys).toEqual(['refs/a.pdf']);

		// Checked as superuser so RLS can't hide leftovers.
		const projects = await db.select({ id: project.id }).from(project);
		expect(projects.map((p) => p.id)).toEqual(['p-stays']);

		expect(
			await db.select().from(projectCollaborator).where(eq(projectCollaborator.userId, GONE))
		).toHaveLength(0);
		expect(await db.select().from(reference).where(eq(reference.userId, GONE))).toHaveLength(0);
		expect(await db.select().from(projectReference)).toHaveLength(0);
		expect(await db.select().from(tag).where(eq(tag.userId, GONE))).toHaveLength(0);
		expect(await db.select().from(userApiKey).where(eq(userApiKey.userId, GONE))).toHaveLength(0);
		expect(await db.select().from(userProfile).where(eq(userProfile.userId, GONE))).toHaveLength(0);

		expect(await db.select().from(reference).where(eq(reference.userId, STAYS))).toHaveLength(1);
		expect(await db.select().from(userProfile).where(eq(userProfile.userId, STAYS))).toHaveLength(
			1
		);
	});
});
