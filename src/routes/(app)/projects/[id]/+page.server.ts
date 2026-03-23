import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { project, projectCollaborator } from '$lib/server/db/schemas/projects.schema';
import { document } from '$lib/server/db/schemas/documents.schema';
import { projectInvitation } from '$lib/server/db/schemas/invitations.schema';
import { projectRequirement } from '$lib/server/db/schemas/requirements.schema';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/auth.schema';
import { eq, desc, and, count, sql } from 'drizzle-orm';

export const load: PageServerLoad = async (event) => {
	const projectId = event.params.id;
	const userId = event.locals.user!.id;

	const [proj, documents, collaborators, invitations, requirementCounts] = await Promise.all([
		event.locals.withRLS((db) =>
			db.select().from(project).where(eq(project.id, projectId)).limit(1)
		),
		event.locals.withRLS((db) =>
			db
				.select()
				.from(document)
				.where(eq(document.projectId, projectId))
				.orderBy(desc(document.updatedAt))
		),
		// Usa db directo (superuser): RLS solo permite ver la propia fila, el owner necesita ver todas
		db
			.select({
				id: projectCollaborator.id,
				userId: projectCollaborator.userId,
				role: projectCollaborator.role,
				createdAt: projectCollaborator.createdAt,
				name: sql<string>`(SELECT name FROM "user" WHERE "user".id = ${projectCollaborator.userId})`,
				email: sql<string>`(SELECT email FROM "user" WHERE "user".id = ${projectCollaborator.userId})`
			})
			.from(projectCollaborator)
			.where(eq(projectCollaborator.projectId, projectId)),
		event.locals.withRLS((db) =>
			db
				.select()
				.from(projectInvitation)
				.where(
					and(eq(projectInvitation.projectId, projectId), eq(projectInvitation.status, 'pending'))
				)
				.orderBy(desc(projectInvitation.createdAt))
		),
		event.locals.withRLS((db) =>
			db
				.select({
					total: count(),
					fulfilled: count(projectRequirement.fulfilledDocumentId),
					requiredTotal: sql<number>`count(*) filter (where ${projectRequirement.required} = true)`,
					requiredFulfilled: sql<number>`count(${projectRequirement.fulfilledDocumentId}) filter (where ${projectRequirement.required} = true)`
				})
				.from(projectRequirement)
				.where(eq(projectRequirement.projectId, projectId))
		) as Promise<{ total: number; fulfilled: number; requiredTotal: number; requiredFulfilled: number }[]>
	]);

	if (!proj[0]) error(404, 'Proyecto no encontrado');

	const myRole = collaborators.find((c) => c.userId === userId)?.role ?? null;

	const reqCounts = (requirementCounts as { total: number; fulfilled: number; requiredTotal: number; requiredFulfilled: number }[])[0] ?? { total: 0, fulfilled: 0, requiredTotal: 0, requiredFulfilled: 0 };

	return {
		project: proj[0],
		documents,
		collaborators,
		invitations,
		myRole,
		isOwner: proj[0].ownerId === userId,
		requirementCounts: reqCounts
	};
};
