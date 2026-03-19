import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { projectInvitation } from '$lib/server/db/schemas/invitations.schema';
import { project } from '$lib/server/db/schemas/projects.schema';

export const load = async ({ params, locals }) => {
	const rows = await db
		.select({
			id: projectInvitation.id,
			role: projectInvitation.role,
			status: projectInvitation.status,
			expiresAt: projectInvitation.expiresAt,
			projectId: projectInvitation.projectId,
			invitedEmail: projectInvitation.invitedEmail,
			projectTitle: project.title,
			projectDescription: project.description
		})
		.from(projectInvitation)
		.leftJoin(project, eq(project.id, projectInvitation.projectId))
		.where(eq(projectInvitation.token, params.token))
		.limit(1);

	if (!rows[0]) error(404, 'Invitación no encontrada');

	return {
		invitation: rows[0],
		token: params.token,
		user: locals.user ?? null
	};
};
