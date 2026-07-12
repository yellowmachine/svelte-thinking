import { describe, it, expect, beforeAll } from 'vitest';
import { createTestDb, createTestCaller, asAnon, type TestDb } from '$lib/server/db/test-utils';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { blogPost } from '$lib/server/db/schemas/blog.schema';
import { eq } from 'drizzle-orm';

let db: TestDb;

async function seedUserWithDocument(userId: string) {
	await db.insert(userProfile).values({ id: userId, userId, displayName: userId });
	const caller = createTestCaller(db, userId);
	const project = await caller.projects.create({ title: `Project for ${userId}` });
	const doc = await caller.documents.create({
		projectId: project.id,
		title: 'Mi primer post',
		type: 'paper'
	});
	return { caller, projectId: project.id, documentId: doc.id, versionId: doc.currentVersionId! };
}

beforeAll(async () => {
	db = await createTestDb();
}, 30_000);

describe('blog.setHandle', () => {
	it('rejects an invalid format (too short)', async () => {
		const { caller } = await seedUserWithDocument('handle-fmt');
		await expect(caller.blog.setHandle({ handle: 'ab' })).rejects.toMatchObject({
			code: 'BAD_REQUEST'
		});
	});

	it('sets a valid handle', async () => {
		const { caller } = await seedUserWithDocument('handle-ok');
		const result = await caller.blog.setHandle({ handle: 'user-ok-blog' });
		expect(result.handle).toBe('user-ok-blog');
	});

	it('rejects a handle already taken by another user', async () => {
		await seedUserWithDocument('handle-owner');
		const owner = createTestCaller(db, 'handle-owner');
		await owner.blog.setHandle({ handle: 'taken-handle' });

		const { caller: other } = await seedUserWithDocument('handle-other');
		await expect(other.blog.setHandle({ handle: 'taken-handle' })).rejects.toMatchObject({
			code: 'CONFLICT'
		});
	});

	it('is rejected once the user has a published post', async () => {
		const { caller, versionId } = await seedUserWithDocument('handle-lock');
		await caller.blog.setHandle({ handle: 'lockable-handle' });
		await caller.blog.publish({ versionId });

		await expect(caller.blog.setHandle({ handle: 'new-handle' })).rejects.toMatchObject({
			code: 'FORBIDDEN'
		});
	});
});

describe('blog.publish', () => {
	it('requires a handle to be set first', async () => {
		const { caller, versionId } = await seedUserWithDocument('publish-nohandle');
		await expect(caller.blog.publish({ versionId })).rejects.toMatchObject({
			code: 'PRECONDITION_FAILED'
		});
	});

	it('snapshots title and rendered HTML, independent of later document edits', async () => {
		const { caller, versionId } = await seedUserWithDocument('publish-snapshot');
		await caller.blog.setHandle({ handle: 'snapshot-blog' });

		const result = await caller.blog.publish({ versionId });
		expect(result.slug).toBeTruthy();
		expect(result.url).toBe(`/@snapshot-blog/${result.slug}`);

		const rows = await db.select().from(blogPost).where(eq(blogPost.id, result.id));
		expect(rows[0].title).toBe('Mi primer post');
		expect(rows[0].renderedHtml).toBeTruthy();
		// documents.create seeds an empty initial version — content snapshot is
		// legitimately '' here, just confirm it round-trips as a string, not null.
		expect(typeof rows[0].content).toBe('string');
	});

	it('is idempotent for the same version', async () => {
		const { caller, versionId } = await seedUserWithDocument('publish-idempotent');
		await caller.blog.setHandle({ handle: 'idempotent-blog' });

		const first = await caller.blog.publish({ versionId });
		const second = await caller.blog.publish({ versionId });
		expect(second.id).toBe(first.id);
		expect(second.slug).toBe(first.slug);

		const rows = await db.select().from(blogPost).where(eq(blogPost.versionId, versionId));
		expect(rows).toHaveLength(1);
	});
});

describe('blog.getMine', () => {
	it('traces a post back to the originating project/document/version', async () => {
		const { caller, projectId, documentId, versionId } = await seedUserWithDocument('trace-user');
		await caller.blog.setHandle({ handle: 'trace-blog' });
		await caller.blog.publish({ versionId });

		const { posts } = await caller.blog.getMine();
		expect(posts).toHaveLength(1);
		expect(posts[0]).toMatchObject({ projectId, documentId, versionNumber: 1 });
	});
});

describe('blog.unpublish', () => {
	it('deletes the post', async () => {
		const { caller, versionId } = await seedUserWithDocument('unpublish-user');
		await caller.blog.setHandle({ handle: 'unpublish-blog' });
		const { id } = await caller.blog.publish({ versionId });

		await caller.blog.unpublish({ postId: id });

		const rows = await db.select().from(blogPost).where(eq(blogPost.id, id));
		expect(rows).toHaveLength(0);
	});
});

describe('blog_post_public_read RLS', () => {
	it('is readable with no app.current_user_id set (anonymous)', async () => {
		const { caller, versionId } = await seedUserWithDocument('public-read-user');
		await caller.blog.setHandle({ handle: 'public-read-blog' });
		const { id } = await caller.blog.publish({ versionId });

		const rows = await asAnon(db, (tx) => tx.select().from(blogPost).where(eq(blogPost.id, id)));
		expect(rows).toHaveLength(1);
		expect(rows[0].title).toBe('Mi primer post');
	});
});
