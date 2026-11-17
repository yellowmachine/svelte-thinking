import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, asUser, type TestDb } from './db/test-utils';
import { deleteAccountData } from './accountDeletion';
import { project, projectCollaborator } from './db/schemas/projects.schema';
import { userProfile, userApiKey } from './db/schemas/users.schema';
import { reference, projectReference } from './db/schemas/references.schema';
import { tag } from './db/schemas/tags.schema';
import { organization, organizationMember } from './db/schemas/organizations.schema';
import { projectPhoto } from './db/schemas/photos.schema';
import { document } from './db/schemas/documents.schema';

const GONE = 'leaving-user';
const STAYS = 'other-user';
const THIRD = 'third-user';

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
	await db.insert(projectCollaborator).values([
		{ id: 'c-1', projectId: 'p-stays', userId: GONE, ownerUserId: STAYS, role: 'coauthor' },
		// p-gone-org goes to STAYS, who owns o-stays and is a coauthor in it.
		{ id: 'c-own', projectId: 'p-gone-org', userId: GONE, ownerUserId: GONE, role: 'owner' },
		{ id: 'c-2', projectId: 'p-gone-org', userId: STAYS, ownerUserId: GONE, role: 'coauthor' },
		{ id: 'c-3', projectId: 'p-gone-org', userId: THIRD, ownerUserId: GONE, role: 'author' }
	]);
	await db
		.insert(document)
		.values({ id: 'd-1', projectId: 'p-gone-org', title: 'Draft', writerUserId: GONE });
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

describe('deleteAccountData', () => {
	it('deletes the user data under RLS and leaves other users alone', async () => {
		const result = await asUser(db, GONE, (tx) => deleteAccountData(tx as never, GONE));

		expect(result.deletedProjects).toBe(1);
		expect(result.handedOverProjectIds).toEqual(['p-gone-org']);
		expect(result.deletedOrgIds).toEqual(['o-gone']);

		// Each file with its bucket. The photo of the project handed over stays.
		expect(result.files).toHaveLength(3);
		expect(result.files).toEqual(
			expect.arrayContaining([
				{ key: 'projects/p-gone/photos/ph-1.png', orgId: null },
				{ key: 'projects/p-gone-org/references/r-gone/paper.pdf', orgId: 'o-stays' },
				{ key: 'refs/c.pdf', orgId: null }
			])
		);

		// Checked as superuser so RLS can't hide leftovers.
		const projects = await db
			.select({ id: project.id, ownerId: project.ownerId, orgId: project.orgId })
			.from(project)
			.orderBy(project.id);
		expect(projects).toEqual([
			// The admin's project in the deleted org stays, now as a personal project.
			{ id: 'p-admin', ownerId: STAYS, orgId: null },
			// The user's project in someone else's org goes to that org's owner.
			{ id: 'p-gone-org', ownerId: STAYS, orgId: 'o-stays' },
			{ id: 'p-stays', ownerId: STAYS, orgId: null }
		]);
		const handedOver = await db
			.select({
				userId: projectCollaborator.userId,
				ownerUserId: projectCollaborator.ownerUserId,
				role: projectCollaborator.role
			})
			.from(projectCollaborator)
			.where(eq(projectCollaborator.projectId, 'p-gone-org'))
			.orderBy(projectCollaborator.userId);
		expect(handedOver).toEqual([
			{ userId: STAYS, ownerUserId: STAYS, role: 'owner' },
			{ userId: THIRD, ownerUserId: STAYS, role: 'author' }
		]);
		const [doc] = await db
			.select({ writerUserId: document.writerUserId })
			.from(document)
			.where(eq(document.id, 'd-1'));
		expect(doc.writerUserId).toBeNull();

		const photos = await db
			.select({ id: projectPhoto.id })
			.from(projectPhoto)
			.orderBy(projectPhoto.id);
		expect(photos.map((p) => p.id)).toEqual(['ph-2', 'ph-3']);

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
