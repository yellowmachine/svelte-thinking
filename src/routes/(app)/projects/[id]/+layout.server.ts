import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { project } from '$lib/server/db/schemas/projects.schema';
import { eq } from 'drizzle-orm';

export const load: LayoutServerLoad = async (event) => {
  const projectId = event.params.id;

  const rows = await event.locals.withRLS((db) =>
    db.select({ orgId: project.orgId }).from(project).where(eq(project.id, projectId)).limit(1),
  ) as { orgId: string | null }[];

  if (!rows[0]) error(404, 'Project not found');

  return { projectOrgId: rows[0].orgId };
};
