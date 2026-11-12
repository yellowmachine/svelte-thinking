import { describe, it, expect, beforeAll } from 'vitest';
import { createTestDb, createTestCaller, type TestDb } from '$lib/server/db/test-utils';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { projectCollaborator } from '$lib/server/db/schemas/projects.schema';

const OWNER = 'doc-owner';
const REVIEWER = 'doc-reviewer';
const STRANGER = 'doc-stranger';

let db: TestDb;
let projectId: string;

beforeAll(async () => {
	db = await createTestDb();
	await db
		.insert(userProfile)
		.values([OWNER, REVIEWER, STRANGER].map((id) => ({ id, userId: id, displayName: id })));
	const proj = await createTestCaller(db, OWNER).projects.create({ title: 'Paper' });
	projectId = proj.id;
	await db.insert(projectCollaborator).values({
		id: crypto.randomUUID(),
		projectId,
		userId: REVIEWER,
		ownerUserId: OWNER,
		role: 'reviewer'
	});
}, 60_000);

describe('documents.create permissions', () => {
	it('lets the owner add a shared document', async () => {
		const doc = await createTestCaller(db, OWNER).documents.create({
			projectId,
			title: 'Methods',
			type: 'paper'
		});
		expect(doc.id).toBeTruthy();
	});

	it('refuses a shared document to a reviewer, allows a private note', async () => {
		const reviewer = createTestCaller(db, REVIEWER);
		await expect(
			reviewer.documents.create({ projectId, title: 'Rewrite', type: 'paper' })
		).rejects.toMatchObject({ code: 'FORBIDDEN' });

		const note = await reviewer.documents.create({
			projectId,
			title: 'My review notes',
			type: 'notes',
			isPrivate: true
		});
		expect(note.id).toBeTruthy();
	});

	it('refuses everything to non-members', async () => {
		await expect(
			createTestCaller(db, STRANGER).documents.create({
				projectId,
				title: 'Spam',
				type: 'notes',
				isPrivate: true
			})
		).rejects.toMatchObject({ code: 'FORBIDDEN' });
	});
});
