import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { projectInvitation } from '$lib/server/db/schemas/invitations.schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const rows = await db
		.select({
			id: projectInvitation.id,
			role: projectInvitation.role,
			status: projectInvitation.status,
			expiresAt: projectInvitation.expiresAt,
			projectId: projectInvitation.projectId,
			invitedEmail: projectInvitation.invitedEmail,
			// Copied onto the invitation when it is sent: whoever opens the link is
			// not a collaborator yet, so RLS hides the project row from them.
			projectTitle: projectInvitation.projectTitle
		})
		.from(projectInvitation)
		.where(eq(projectInvitation.token, params.token))
		.limit(1);

	if (!rows[0]) error(404, 'Invitation not found');

	return {
		invitation: rows[0],
		token: params.token,
		user: locals.user ?? null
	};
};
