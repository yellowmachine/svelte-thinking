import type { PageServerLoad } from './$types';
import { feedback } from '$lib/server/db/schemas/feedback.schema';
import { desc } from 'drizzle-orm';
import { db } from '$lib/server/db';

export const load: PageServerLoad = async () => {
	const entries = await db
		.select({
			id: feedback.id,
			message: feedback.message,
			showName: feedback.showName,
			userName: feedback.userName,
			createdAt: feedback.createdAt
		})
		.from(feedback)
		.orderBy(desc(feedback.createdAt));

	return { entries };
};
