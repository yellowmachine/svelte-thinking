import { describe, it, expect, beforeAll } from 'vitest';
import { createTestDb, createTestCaller, asAnon, type TestDb } from '$lib/server/db/test-utils';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { blogPostComment } from '$lib/server/db/schemas/blog.schema';
import { eq } from 'drizzle-orm';

let db: TestDb;

async function seedPublishedPost(userId: string, commentsEnabled: boolean) {
	await db.insert(userProfile).values({ id: userId, userId, displayName: userId });
	const caller = createTestCaller(db, userId);
	await caller.blog.setHandle({ handle: `${userId}-blog` });
	const project = await caller.projects.create({ title: `Project for ${userId}` });
	const doc = await caller.documents.create({
		projectId: project.id,
		title: 'Post con comentarios',
		type: 'paper'
	});
	const post = await caller.blog.publish({ versionId: doc.currentVersionId!, commentsEnabled });
	return { caller, postId: post.id };
}

beforeAll(async () => {
	db = await createTestDb();
}, 30_000);

describe('blogComments.create', () => {
	it('rejects a comment when the post has comments disabled', async () => {
		const { postId } = await seedPublishedPost('comment-author-1', false);
		const commenter = createTestCaller(db, 'commenter-1');

		await expect(
			commenter.blogComments.create({ blogPostId: postId, content: 'Hola' })
		).rejects.toMatchObject({ code: 'FORBIDDEN' });
	});

	it('creates a pending comment when the post has comments enabled', async () => {
		const { postId } = await seedPublishedPost('comment-author-2', true);
		const commenter = createTestCaller(db, 'commenter-2');

		const created = await commenter.blogComments.create({ blogPostId: postId, content: 'Hola!' });
		expect(created.status).toBe('pending');
		expect(created.aiFlagged).toBe(false);
	});
});

describe('blog_post_comment visibility', () => {
	it('hides pending comments from anonymous visitors', async () => {
		const { postId } = await seedPublishedPost('comment-author-3', true);
		const commenter = createTestCaller(db, 'commenter-3');
		await commenter.blogComments.create({ blogPostId: postId, content: 'pendiente' });

		const publicRows = await asAnon(db, (tx) =>
			tx.select().from(blogPostComment).where(eq(blogPostComment.blogPostId, postId))
		);
		expect(publicRows).toHaveLength(0);
	});

	it('shows approved comments to anonymous visitors once the owner moderates them', async () => {
		const { caller: owner, postId } = await seedPublishedPost('comment-author-4', true);
		const commenter = createTestCaller(db, 'commenter-4');
		const created = await commenter.blogComments.create({
			blogPostId: postId,
			content: 'aprobado'
		});

		await owner.blogComments.moderate({ commentId: created.id, status: 'approved' });

		const publicRows = await asAnon(db, (tx) =>
			tx.select().from(blogPostComment).where(eq(blogPostComment.blogPostId, postId))
		);
		expect(publicRows).toHaveLength(1);
		expect(publicRows[0].status).toBe('approved');
	});

	it('hides approved comments once the owner hides the whole post thread', async () => {
		const { caller: owner, postId } = await seedPublishedPost('comment-author-5', true);
		const commenter = createTestCaller(db, 'commenter-5');
		const created = await commenter.blogComments.create({ blogPostId: postId, content: 'x' });
		await owner.blogComments.moderate({ commentId: created.id, status: 'approved' });

		await owner.blog.setCommentsVisible({ postId, visible: false });

		const publicRows = await asAnon(db, (tx) =>
			tx.select().from(blogPostComment).where(eq(blogPostComment.blogPostId, postId))
		);
		expect(publicRows).toHaveLength(0);
	});

	it('rejects moderation attempts from a user who does not own the post', async () => {
		const { postId } = await seedPublishedPost('comment-author-6', true);
		const commenter = createTestCaller(db, 'commenter-6');
		const created = await commenter.blogComments.create({ blogPostId: postId, content: 'x' });

		const stranger = createTestCaller(db, 'stranger-6');
		await expect(
			stranger.blogComments.moderate({ commentId: created.id, status: 'approved' })
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});
});

describe('blogComments.delete', () => {
	it('lets the comment author delete their own comment', async () => {
		const { postId } = await seedPublishedPost('comment-author-7', true);
		const commenter = createTestCaller(db, 'commenter-7');
		const created = await commenter.blogComments.create({ blogPostId: postId, content: 'x' });

		await expect(commenter.blogComments.delete(created.id)).resolves.toMatchObject({
			id: created.id
		});
	});

	it('rejects deletion by a user who is neither the author nor the post owner', async () => {
		const { postId } = await seedPublishedPost('comment-author-8', true);
		const commenter = createTestCaller(db, 'commenter-8');
		const created = await commenter.blogComments.create({ blogPostId: postId, content: 'x' });

		const stranger = createTestCaller(db, 'stranger-8');
		await expect(stranger.blogComments.delete(created.id)).rejects.toMatchObject({
			code: 'NOT_FOUND'
		});
	});
});
