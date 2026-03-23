import { eq, and } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { projectInvitation } from '$lib/server/db/schemas/invitations.schema';
import { sql } from 'drizzle-orm';
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
			projectTitle: sql<string>`(SELECT title FROM scholio.project WHERE project.id = ${projectInvitation.projectId})`
		})
		.from(projectInvitation)
		.where(
			and(
				eq(projectInvitation.invitedEmail, userEmail),
				eq(projectInvitation.status, 'pending')
			)
		)
		.orderBy(projectInvitation.createdAt);

	return { invitations };
};
