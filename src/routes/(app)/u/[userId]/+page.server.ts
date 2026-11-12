import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { user } from '$lib/server/db/auth.schema';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { project, projectCollaborator } from '$lib/server/db/schemas/projects.schema';
import { documentVersion } from '$lib/server/db/schemas/documents.schema';
import { projectInterest } from '$lib/server/db/schemas/discover.schema';
import { eq, and, ne, count, max } from 'drizzle-orm';

export const load: PageServerLoad = async (event) => {
	const targetUserId = event.params.userId;
	const viewerId = event.locals.user!.id;
	// Every query runs under RLS as the viewer: without a user id the policies on
	// user_profile, project, project_interest and project_collaborator return
	// nothing. Collaborations and commits only count what the viewer can see.
	const withRLS = event.locals.withRLS;

	const [profileRow, ownedSearchableProjects, myInterest, collabRows, commitRows] =
		await Promise.all([
			withRLS((db) =>
				db
					.select({
						userId: user.id,
						name: user.name,
						displayName: userProfile.displayName,
						bio: userProfile.bio,
						institution: userProfile.institution,
						orcid: userProfile.orcid,
						orcidVerified: userProfile.orcidVerified
					})
					.from(user)
					.leftJoin(userProfile, eq(userProfile.userId, user.id))
					.where(eq(user.id, targetUserId))
					.limit(1)
			),

			withRLS((db) =>
				db
					.select({ id: project.id, title: project.title, description: project.description })
					.from(project)
					.where(and(eq(project.ownerId, targetUserId), eq(project.isSearchable, true)))
			),

			withRLS((db) =>
				db
					.select({ projectId: projectInterest.projectId })
					.from(projectInterest)
					.innerJoin(project, eq(project.id, projectInterest.projectId))
					.where(and(eq(projectInterest.userId, viewerId), eq(project.ownerId, targetUserId)))
			),

			// Proyectos como colaborador (excluye rol owner) con estado del proyecto
			withRLS((db) =>
				db
					.select({ role: projectCollaborator.role, status: project.status })
					.from(projectCollaborator)
					.innerJoin(project, eq(project.id, projectCollaborator.projectId))
					.where(
						and(eq(projectCollaborator.userId, targetUserId), ne(projectCollaborator.role, 'owner'))
					)
			),

			// Commits totales y fecha del último
			withRLS((db) =>
				db
					.select({ total: count(), lastAt: max(documentVersion.createdAt) })
					.from(documentVersion)
					.where(eq(documentVersion.createdBy, targetUserId))
			)
		]);

	if (!profileRow[0]) error(404, 'User not found');

	const pinnedProjectIds = myInterest.map((i) => i.projectId);

	const reputation = {
		projectsTotal: collabRows.length,
		projectsCompleted: collabRows.filter((r) => r.status === 'published' || r.status === 'archived')
			.length,
		rolesWorked: [...new Set(collabRows.map((r) => r.role))] as string[],
		totalCommits: commitRows[0]?.total ?? 0,
		lastActiveAt: commitRows[0]?.lastAt ?? null
	};

	return {
		profile: profileRow[0],
		reputation,
		ownedSearchableProjects,
		pinnedProjectIds,
		isOwnProfile: targetUserId === viewerId
	};
};
