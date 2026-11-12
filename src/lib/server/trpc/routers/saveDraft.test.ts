import { describe, it, expect, beforeAll } from 'vitest';
import { createTestDb, createTestCaller, type TestDb } from '$lib/server/db/test-utils';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { sha256Hex } from '$lib/utils/contentHash';

const USER = 'draft-user';
let db: TestDb;
let documentId: string;
const hash = (t: string) => sha256Hex(t);

beforeAll(async () => {
	db = await createTestDb();
	await db.insert(userProfile).values({ id: USER, userId: USER, displayName: USER });
	const caller = createTestCaller(db, USER);
	const proj = await caller.projects.create({ title: 'Paper' });
	const doc = await caller.documents.create({ projectId: proj.id, title: 'Intro', type: 'paper' });
	documentId = doc.id;
}, 60_000);

describe('documents.saveDraft — concurrent edits', () => {
	it('saves when the client knew the server draft', async () => {
		const caller = createTestCaller(db, USER);
		// No draft yet on the server: the client's base is ''.
		await expect(
			caller.documents.saveDraft({
				documentId,
				content: 'tab A v1',
				baseDraftHash: await hash('')
			})
		).resolves.toMatchObject({ id: documentId });
		await expect(
			caller.documents.saveDraft({
				documentId,
				content: 'tab A v2',
				baseDraftHash: await hash('tab A v1')
			})
		).resolves.toMatchObject({ id: documentId });
	});

	it('refuses to overwrite a draft another tab saved in between', async () => {
		const caller = createTestCaller(db, USER);
		// Tab B still believes the draft is 'tab A v1'.
		await expect(
			caller.documents.saveDraft({
				documentId,
				content: 'tab B',
				baseDraftHash: await hash('tab A v1')
			})
		).rejects.toMatchObject({ code: 'CONFLICT' });
	});

	it('accepts a save identical to the server draft, and saves without a hash as before', async () => {
		const caller = createTestCaller(db, USER);
		await expect(
			caller.documents.saveDraft({
				documentId,
				content: 'tab A v2',
				baseDraftHash: await hash('something old')
			})
		).resolves.toMatchObject({ id: documentId });
		await expect(
			caller.documents.saveDraft({ documentId, content: 'mobile note' })
		).resolves.toMatchObject({ id: documentId });
	});

	it('does not conflict after a commit cleared the draft', async () => {
		const caller = createTestCaller(db, USER);
		await caller.documents.commit({ documentId, message: 'v2' });
		await expect(
			caller.documents.saveDraft({
				documentId,
				content: 'after commit',
				baseDraftHash: await hash('mobile note')
			})
		).resolves.toMatchObject({ id: documentId });
	});
});
