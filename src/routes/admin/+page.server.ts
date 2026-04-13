import { db } from '$lib/server/db';
import { user, session } from '$lib/server/db/auth.schema';
import { waitlist } from '$lib/server/db/schemas/waitlist.schema';
import { eq, gt, count, countDistinct } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

const ACTIVITY_DAYS = 30;

export const load: PageServerLoad = async () => {
	const since = new Date(Date.now() - ACTIVITY_DAYS * 24 * 60 * 60 * 1000);

	const [[{ total: totalUsers }], [{ total: pendingWaitlist }], [{ total: recentlyActive }]] =
		await Promise.all([
			db.select({ total: count() }).from(user),
			db.select({ total: count() }).from(waitlist).where(eq(waitlist.status, 'pending')),
			db.select({ total: countDistinct(session.userId) }).from(session).where(gt(session.updatedAt, since))
		]);

	return { totalUsers, pendingWaitlist, recentlyActive, activityDays: ACTIVITY_DAYS };
};
