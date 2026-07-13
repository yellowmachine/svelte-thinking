import { describe, it, expect, beforeAll } from 'vitest';
import { createTestDb, createTestCaller, asAnon, type TestDb } from '$lib/server/db/test-utils';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { blogAggregator, blogAggregatorItem } from '$lib/server/db/schemas/blog.schema';
import { eq } from 'drizzle-orm';

let db: TestDb;

async function seedUserWithHandle(userId: string) {
	await db.insert(userProfile).values({ id: userId, userId, displayName: userId, handle: userId });
	return createTestCaller(db, userId);
}

beforeAll(async () => {
	db = await createTestDb();
}, 30_000);

describe('blogAggregators.create + addBlog', () => {
	it('creates a list and adds a blog to it by handle', async () => {
		const curator = await seedUserWithHandle('curator-1');
		await seedUserWithHandle('followed-1');

		const agg = await curator.blogAggregators.create({ title: 'Blogs sobre ciencia' });
		expect(agg.slug).toBe('blogs-sobre-ciencia');

		const item = await curator.blogAggregators.addBlog({
			aggregatorId: agg.id,
			handle: 'followed-1'
		});
		expect(item.handle).toBe('followed-1');

		const items = await curator.blogAggregators.listItems(agg.id);
		expect(items).toHaveLength(1);
	});

	it('rejects adding a handle that does not exist', async () => {
		const curator = await seedUserWithHandle('curator-2');
		const agg = await curator.blogAggregators.create({ title: 'Lista' });

		await expect(
			curator.blogAggregators.addBlog({ aggregatorId: agg.id, handle: 'nadie-existe' })
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});

	it('rejects adding the same blog twice', async () => {
		const curator = await seedUserWithHandle('curator-3');
		await seedUserWithHandle('followed-3');
		const agg = await curator.blogAggregators.create({ title: 'Lista' });

		await curator.blogAggregators.addBlog({ aggregatorId: agg.id, handle: 'followed-3' });
		await expect(
			curator.blogAggregators.addBlog({ aggregatorId: agg.id, handle: 'followed-3' })
		).rejects.toMatchObject({ code: 'CONFLICT' });
	});

	it("rejects a stranger adding blogs to someone else's list", async () => {
		const curator = await seedUserWithHandle('curator-4');
		await seedUserWithHandle('followed-4');
		const agg = await curator.blogAggregators.create({ title: 'Lista' });

		const stranger = await seedUserWithHandle('stranger-4');
		await expect(
			stranger.blogAggregators.addBlog({ aggregatorId: agg.id, handle: 'followed-4' })
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});
});

describe('blogAggregators ownership', () => {
	it('rejects update/delete from a user who does not own the list', async () => {
		const curator = await seedUserWithHandle('curator-5');
		const agg = await curator.blogAggregators.create({ title: 'Lista' });

		const stranger = await seedUserWithHandle('stranger-5');
		await expect(
			stranger.blogAggregators.update({ id: agg.id, title: 'Hackeado' })
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
		await expect(stranger.blogAggregators.delete(agg.id)).rejects.toMatchObject({
			code: 'NOT_FOUND'
		});
	});

	it('lets the owner rename and delete their own list', async () => {
		const curator = await seedUserWithHandle('curator-6');
		const agg = await curator.blogAggregators.create({ title: 'Lista' });

		await curator.blogAggregators.update({ id: agg.id, title: 'Lista renombrada' });
		await curator.blogAggregators.delete(agg.id);

		const remaining = await curator.blogAggregators.listMine();
		expect(remaining.find((a) => a.id === agg.id)).toBeUndefined();
	});
});

describe('blog_aggregator visibility', () => {
	it('is readable by anonymous visitors, since aggregators are always public', async () => {
		const curator = await seedUserWithHandle('curator-7');
		await seedUserWithHandle('followed-7');
		const agg = await curator.blogAggregators.create({ title: 'Lista pública' });
		await curator.blogAggregators.addBlog({ aggregatorId: agg.id, handle: 'followed-7' });

		const publicAgg = await asAnon(db, (tx) =>
			tx.select().from(blogAggregator).where(eq(blogAggregator.id, agg.id))
		);
		expect(publicAgg).toHaveLength(1);

		const publicItems = await asAnon(db, (tx) =>
			tx.select().from(blogAggregatorItem).where(eq(blogAggregatorItem.aggregatorId, agg.id))
		);
		expect(publicItems).toHaveLength(1);
	});
});
