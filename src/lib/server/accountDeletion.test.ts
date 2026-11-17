import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, asUser, type TestDb } from './db/test-utils';
import { collectAccountFiles, deleteAccountData } from './accountDeletion';
import { project, projectCollaborator } from './db/schemas/projects.schema';
import { userProfile, userApiKey } from './db/schemas/users.schema';
import { reference, projectReference } from './db/schemas/references.schema';
import { tag } from './db/schemas/tags.schema';
import { organization, organizationMember } from './db/schemas/organizations.schema';
import { projectPhoto } from './db/schemas/photos.schema';

const GONE = 'leaving-user';
const STAYS = 'other-user';

const photo = (id: string, projectId: string, uploadedBy: string) => ({
	id,
	projectId,
	uploadedBy,
	key: `projects/${projectId}/photos/${id}.png`,
	url: `https://bucket/${id}.png`,
	filename: `${id}.png`,
	mimeType: 'image/png',
	size: 1
});

let db: TestDb;

beforeAll(async () => {
	db = await createTestDb();

	// Seeded as superuser, bypassing RLS.
	await db.insert(userProfile).values([
		{ id: GONE, userId: GONE, displayName: 'Leaving' },
		{ id: STAYS, userId: STAYS, displayName: 'Staying' }
	]);

	// GONE owns o-gone, where STAYS is an admin; GONE is an admin in o-stays.
	await db.insert(organization).values([
		{ id: 'o-gone', name: 'Gone org', slug: 'gone-org', ownerId: GONE },
		{ id: 'o-stays', name: 'Staying org', slug: 'staying-org', ownerId: STAYS }
	]);
	await db.insert(organizationMember).values([
		{ id: 'm-1', orgId: 'o-gone', userId: STAYS, orgOwnerId: GONE, role: 'admin' },
		{ id: 'm-2', orgId: 'o-stays', userId: GONE, orgOwnerId: STAYS, role: 'admin' }
	]);

	await db.insert(project).values([
		{ id: 'p-gone', title: 'Mine', ownerId: GONE },
		{ id: 'p-gone-org', title: 'Mine, in their org', ownerId: GONE, orgId: 'o-stays' },
		{ id: 'p-admin', title: 'Theirs, in my org', ownerId: STAYS, orgId: 'o-gone' },
		{ id: 'p-stays', title: 'Theirs', ownerId: STAYS }
	]);
	await db.insert(projectCollaborator).values({
		id: 'c-1',
		projectId: 'p-stays',
		userId: GONE,
		ownerUserId: STAYS,
		role: 'coauthor'
	});
	await db
		.insert(projectPhoto)
		.values([
			photo('ph-1', 'p-gone', GONE),
			photo('ph-2', 'p-gone-org', GONE),
			photo('ph-3', 'p-admin', STAYS)
		]);

	await db.insert(reference).values([
		// Uploaded through p-gone-org (org bucket), also linked to p-stays.
		{
			id: 'r-gone',
			userId: GONE,
			citeKey: 'a2020',
			title: 'A',
			pdfKey: 'projects/p-gone-org/references/r-gone/paper.pdf'
		},
		// In no project: the user's own bucket.
		{ id: 'r-loose', userId: GONE, citeKey: 'c2020', title: 'C', pdfKey: 'refs/c.pdf' },
		{ id: 'r-stays', userId: STAYS, citeKey: 'b2020', title: 'B' }
	]);
	await db.insert(projectReference).values([
		{ projectId: 'p-stays', referenceId: 'r-gone' },
		{ projectId: 'p-gone-org', referenceId: 'r-gone' }
	]);
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

describe('account deletion', () => {
	it('lists each file with the bucket it lives in', async () => {
		const files = await asUser(db, GONE, (tx) => collectAccountFiles(tx as never, GONE));

		expect(files).toHaveLength(4);
		expect(files).toEqual(
			expect.arrayContaining([
				{ key: 'projects/p-gone/photos/ph-1.png', orgId: null },
				{ key: 'projects/p-gone-org/photos/ph-2.png', orgId: 'o-stays' },
				{ key: 'projects/p-gone-org/references/r-gone/paper.pdf', orgId: 'o-stays' },
				{ key: 'refs/c.pdf', orgId: null }
			])
		);
	});

	it('deletes the user data under RLS and leaves other users alone', async () => {
		const result = await asUser(db, GONE, (tx) => deleteAccountData(tx as never, GONE));

		expect(result.deletedProjects).toBe(2);
		expect(result.deletedOrgIds).toEqual(['o-gone']);

		// Checked as superuser so RLS can't hide leftovers.
		const projects = await db
			.select({ id: project.id, orgId: project.orgId })
			.from(project)
			.orderBy(project.id);
		// The admin's project in the deleted org stays, now as a personal project.
		expect(projects).toEqual([
			{ id: 'p-admin', orgId: null },
			{ id: 'p-stays', orgId: null }
		]);
		const photos = await db.select({ id: projectPhoto.id }).from(projectPhoto);
		expect(photos.map((p) => p.id)).toEqual(['ph-3']);

		const orgs = await db.select({ id: organization.id }).from(organization);
		expect(orgs.map((o) => o.id)).toEqual(['o-stays']);
		expect(
			await db.select().from(organizationMember).where(eq(organizationMember.userId, GONE))
		).toHaveLength(0);

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
