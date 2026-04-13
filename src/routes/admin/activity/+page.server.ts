import { db } from '$lib/server/db';
import { user, session } from '$lib/server/db/auth.schema';
import { eq, gt, max, desc } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

const DAYS = 30;

export const load: PageServerLoad = async () => {
	const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);

	const activeUsers = await db
		.select({
			id: user.id,
			name: user.name,
			email: user.email,
			lastSeen: max(session.updatedAt)
		})
		.from(user)
		.innerJoin(session, eq(session.userId, user.id))
		.where(gt(session.updatedAt, since))
		.groupBy(user.id, user.name, user.email)
		.orderBy(desc(max(session.updatedAt)));

	return { activeUsers, days: DAYS };
};
