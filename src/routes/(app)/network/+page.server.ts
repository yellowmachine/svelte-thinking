import { eq, and, gt } from 'drizzle-orm';
import { projectInvitation } from '$lib/server/db/schemas/invitations.schema';
import { user } from '$lib/server/db/auth.schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const userEmail = event.locals.user!.email;

	// Under RLS as the user: invitation_select lets the invitee see rows sent to
	// their email. Without a user id it only worked through the `= ''` branch.
	const invitations = await event.locals.withRLS((db) =>
		db
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
			.orderBy(projectInvitation.createdAt)
	);

	return { invitations };
};
