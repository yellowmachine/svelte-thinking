import { db } from '$lib/server/db';
import { user, session } from '$lib/server/db/auth.schema';
import { project } from '$lib/server/db/schemas/projects.schema';
import { eq, gt, max, count, desc } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

const DAYS = 30;

export const load: PageServerLoad = async ({ locals }) => {
	const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);

	const activeUsers = await locals.withAdminRLS((tx) =>
		tx
			.select({
				id: user.id,
				name: user.name,
				email: user.email,
				lastSeen: max(session.updatedAt),
				projectCount: count(project.id)
			})
			.from(user)
			.innerJoin(session, eq(session.userId, user.id))
			.leftJoin(project, eq(project.ownerId, user.id))
			.where(gt(session.updatedAt, since))
			.groupBy(user.id, user.name, user.email)
			.orderBy(desc(max(session.updatedAt)))
	);

	return { activeUsers, days: DAYS };
};
