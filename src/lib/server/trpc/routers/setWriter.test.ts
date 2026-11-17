import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, createTestCaller, type TestDb } from '$lib/server/db/test-utils';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { projectCollaborator } from '$lib/server/db/schemas/projects.schema';
import { document } from '$lib/server/db/schemas/documents.schema';

const OWNER = 'writer-owner';
const ANA = 'writer-ana';
const BEA = 'writer-bea';

let db: TestDb;
let projectId: string;
let documentId: string;

const writerOf = async () => {
	const [row] = await db
		.select({ writerUserId: document.writerUserId })
		.from(document)
		.where(eq(document.id, documentId));
	return row.writerUserId;
};

beforeAll(async () => {
	db = await createTestDb();
	await db
		.insert(userProfile)
		.values([OWNER, ANA, BEA].map((u) => ({ id: u, userId: u, displayName: u })));
	const owner = createTestCaller(db, OWNER);
	projectId = (await owner.projects.create({ title: 'Paper' })).id;
	documentId = (await owner.documents.create({ projectId, title: 'Intro', type: 'paper' })).id;
	await db.insert(projectCollaborator).values([
		{ id: 'c-ana', projectId, userId: ANA, ownerUserId: OWNER, role: 'author' },
		{ id: 'c-bea', projectId, userId: BEA, ownerUserId: OWNER, role: 'coauthor' }
	]);
}, 60_000);

describe('documents.setWriter', () => {
	it('lets the owner hand write access to a collaborator', async () => {
		await createTestCaller(db, OWNER).documents.setWriter({ documentId, writerUserId: ANA });
		expect(await writerOf()).toBe(ANA);
	});

	it('lets the owner move it from one writer to another', async () => {
		await createTestCaller(db, OWNER).documents.setWriter({ documentId, writerUserId: BEA });
		expect(await writerOf()).toBe(BEA);
	});

	it('lets the owner take it back', async () => {
		await createTestCaller(db, OWNER).documents.setWriter({ documentId, writerUserId: null });
		expect(await writerOf()).toBeNull();
	});

	it('lets the writer give it up', async () => {
		await createTestCaller(db, OWNER).documents.setWriter({ documentId, writerUserId: ANA });
		await createTestCaller(db, ANA).documents.setWriter({ documentId, writerUserId: null });
		expect(await writerOf()).toBeNull();
	});

	it("doesn't let the writer pass it to someone else, nor others touch it", async () => {
		await createTestCaller(db, OWNER).documents.setWriter({ documentId, writerUserId: ANA });
		await expect(
			createTestCaller(db, ANA).documents.setWriter({ documentId, writerUserId: BEA })
		).rejects.toThrow();
		await expect(
			createTestCaller(db, BEA).documents.setWriter({ documentId, writerUserId: null })
		).rejects.toThrow();
		expect(await writerOf()).toBe(ANA);
	});
});
