import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { project } from '$lib/server/db/schemas/projects.schema';
import { orgS3Config } from '$lib/server/db/schemas/organizations.schema';
import { eq } from 'drizzle-orm';
import { deleteProjectNow } from '$lib/server/projectDeletion';

export const load: LayoutServerLoad = async (event) => {
	const projectId = event.params.id;

	const rows = (await event.locals.withRLS((db) =>
		db
			.select({
				title: project.title,
				orgId: project.orgId,
				ownerId: project.ownerId,
				scheduledDeleteAt: project.scheduledDeleteAt
			})
			.from(project)
			.where(eq(project.id, projectId))
			.limit(1)
	)) as {
		title: string;
		orgId: string | null;
		ownerId: string;
		scheduledDeleteAt: Date | null;
	}[];

	if (!rows[0]) error(404, 'Project not found');

	const { title, orgId, ownerId, scheduledDeleteAt } = rows[0];
	const userId = event.locals.user!.id;

	// Lazy deletion: once the deadline has passed, the owner's next visit deletes it.
	// Collaborators keep seeing the scheduled-deletion banner until then.
	if (scheduledDeleteAt && scheduledDeleteAt <= new Date() && ownerId === userId) {
		const deleted = await deleteProjectNow(event.locals.withRLS, projectId, userId);
		if (deleted) redirect(302, '/projects');
	}

	let hasOrgS3Config = false;
	if (orgId) {
		try {
			const s3Rows = (await event.locals.withRLS((db) =>
				db
					.select({ id: orgS3Config.id })
					.from(orgS3Config)
					.where(eq(orgS3Config.orgId, orgId))
					.limit(1)
			)) as { id: string }[];
			hasOrgS3Config = s3Rows.length > 0;
		} catch {
			// Non-critical — S3 CTA simply won't show
		}
	}

	return {
		projectTitle: title,
		projectOrgId: orgId,
		hasOrgS3Config,
		isOwner: ownerId === userId,
		scheduledDeleteAt: scheduledDeleteAt?.toISOString() ?? null
	};
};
