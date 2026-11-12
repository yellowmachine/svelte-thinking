import { and, eq } from 'drizzle-orm';
import type { Db } from '$lib/server/db';
import { project, projectCollaborator } from '$lib/server/db/schemas/projects.schema';
import type { CollaboratorRole } from '$lib/domain/permissions';

/**
 * The user's role in a project: 'owner', their collaborator role, or null if
 * they are not a member (or RLS hides the project from them). Call it on a
 * withRLS transaction.
 */
export async function projectRoleOf(
	db: Db,
	projectId: string,
	userId: string
): Promise<'owner' | CollaboratorRole | null> {
	const [proj] = await db
		.select({ ownerId: project.ownerId })
		.from(project)
		.where(eq(project.id, projectId))
		.limit(1);
	if (!proj) return null;
	if (proj.ownerId === userId) return 'owner';

	const [collab] = await db
		.select({ role: projectCollaborator.role })
		.from(projectCollaborator)
		.where(
			and(eq(projectCollaborator.projectId, projectId), eq(projectCollaborator.userId, userId))
		)
		.limit(1);
	if (!collab || collab.role === 'owner') return collab ? 'owner' : null;
	return collab.role;
}
