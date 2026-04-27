import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { project } from '$lib/server/db/schemas/projects.schema';
import { orgS3Config } from '$lib/server/db/schemas/organizations.schema';
import { projectPhoto } from '$lib/server/db/schemas/photos.schema';
import { reference, projectReference } from '$lib/server/db/schemas/references.schema';
import { eq, and, isNotNull } from 'drizzle-orm';
import { resolveProjectS3Config } from '$lib/server/s3Storage';
import { deleteFileWithConfig } from '$lib/server/storage';

export const load: LayoutServerLoad = async (event) => {
	const projectId = event.params.id;

	const rows = (await event.locals.withRLS((db) =>
		db
			.select({
				orgId: project.orgId,
				ownerId: project.ownerId,
				scheduledDeleteAt: project.scheduledDeleteAt
			})
			.from(project)
			.where(eq(project.id, projectId))
			.limit(1)
	)) as { orgId: string | null; ownerId: string; scheduledDeleteAt: Date | null }[];

	if (!rows[0]) error(404, 'Project not found');

	const { orgId, ownerId, scheduledDeleteAt } = rows[0];
	const userId = event.locals.user!.id;

	// Lazy deletion: if the deadline has passed, execute the cascade now
	if (scheduledDeleteAt && scheduledDeleteAt <= new Date()) {
		const [photoKeys, pdfKeys] = await Promise.all([
			event.locals.withRLS((db) =>
				db
					.select({ key: projectPhoto.key })
					.from(projectPhoto)
					.where(eq(projectPhoto.projectId, projectId))
			),
			event.locals.withRLS((db) =>
				db
					.select({ key: reference.pdfKey })
					.from(reference)
					.innerJoin(projectReference, eq(projectReference.referenceId, reference.id))
					.where(and(eq(projectReference.projectId, projectId), isNotNull(reference.pdfKey)))
			)
		]);

		await event.locals.withRLS((db) => db.delete(project).where(eq(project.id, projectId)));

		const s3 = await resolveProjectS3Config(projectId, userId, event.locals.withRLS).catch(
			() => null
		);
		if (s3) {
			const keys = [...photoKeys.map((r) => r.key), ...pdfKeys.map((r) => r.key as string)];
			await Promise.allSettled(keys.map((key) => deleteFileWithConfig(s3, key)));
		}

		redirect(302, '/projects');
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
		projectOrgId: orgId,
		hasOrgS3Config,
		isOwner: ownerId === userId,
		scheduledDeleteAt: scheduledDeleteAt?.toISOString() ?? null
	};
};
