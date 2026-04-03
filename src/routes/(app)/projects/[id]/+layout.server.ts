import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { project } from '$lib/server/db/schemas/projects.schema';
import { orgS3Config } from '$lib/server/db/schemas/organizations.schema';
import { eq } from 'drizzle-orm';

export const load: LayoutServerLoad = async (event) => {
  const projectId = event.params.id;

  const rows = await event.locals.withRLS((db) =>
    db.select({ orgId: project.orgId }).from(project).where(eq(project.id, projectId)).limit(1),
  ) as { orgId: string | null }[];

  if (!rows[0]) error(404, 'Project not found');

  const orgId = rows[0].orgId;

  let hasOrgS3Config = false;
  if (orgId) {
    try {
      const s3Rows = await event.locals.withRLS((db) =>
        db.select({ id: orgS3Config.id }).from(orgS3Config).where(eq(orgS3Config.orgId, orgId)).limit(1)
      ) as { id: string }[];
      hasOrgS3Config = s3Rows.length > 0;
    } catch {
      // Non-critical — S3 CTA simply won't show
    }
  }

  return { projectOrgId: orgId, hasOrgS3Config };
};
