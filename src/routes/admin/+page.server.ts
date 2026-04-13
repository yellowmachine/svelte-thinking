import { db } from '$lib/server/db';
import { user } from '$lib/server/db/auth.schema';
import { waitlist } from '$lib/server/db/schemas/waitlist.schema';
import { eq, count } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [[{ total: totalUsers }], [{ total: pendingWaitlist }]] = await Promise.all([
		db.select({ total: count() }).from(user),
		db.select({ total: count() }).from(waitlist).where(eq(waitlist.status, 'pending'))
	]);

	return { totalUsers, pendingWaitlist };
};
