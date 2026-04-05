import { eq, and, gt } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { projectInvitation } from '$lib/server/db/schemas/invitations.schema';
import { user } from '$lib/server/db/auth.schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const userEmail = event.locals.user!.email;

	const invitations = await db
		.select({
			id: projectInvitation.id,
			token: projectInvitation.token,
			role: projectInvitation.role,
			expiresAt: projectInvitation.expiresAt,
			createdAt: projectInvitation.createdAt,
			projectId: projectInvitation.projectId,
			projectTitle: projectInvitation.projectTitle,
			invitedByName: user.name
		})
		.from(projectInvitation)
		.leftJoin(user, eq(user.id, projectInvitation.invitedBy))
		.where(
			and(
				eq(projectInvitation.invitedEmail, userEmail),
				eq(projectInvitation.status, 'pending'),
				gt(projectInvitation.expiresAt, new Date())
			)
		)
		.orderBy(projectInvitation.createdAt);

	return { invitations };
};
