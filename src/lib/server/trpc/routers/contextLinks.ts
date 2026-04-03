import { z } from 'zod';
import { eq, and, ne, asc, isNull, or } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../init';
import { projectContextLink } from '$lib/server/db/schemas/contextLinks.schema';
import { document } from '$lib/server/db/schemas/documents.schema';
import { project } from '$lib/server/db/schemas/projects.schema';

export const contextLinksRouter = router({
	// All context links for a project, with doc title + source project title
	list: protectedProcedure.input(z.string()).query(async ({ ctx, input: projectId }) => {
		const rows = (await ctx.withRLS((db) =>
			db
				.select({
					id: projectContextLink.id,
					linkedDocumentId: projectContextLink.linkedDocumentId,
					docTitle: document.title,
					docType: document.type,
					sourceProjectId: document.projectId,
					sourceProjectTitle: project.title
				})
				.from(projectContextLink)
				.innerJoin(document, eq(document.id, projectContextLink.linkedDocumentId))
				.innerJoin(project, eq(project.id, document.projectId))
				.where(eq(projectContextLink.projectId, projectId))
				.orderBy(asc(project.title), asc(document.title))
		)) as {
			id: string;
			linkedDocumentId: string;
			docTitle: string;
			docType: string;
			sourceProjectId: string;
			sourceProjectTitle: string;
		}[];

		return rows;
	}),

	// All documents the user can access from other projects (for the picker).
	// Includes public documents from other users — project title will be null for those.
	listAvailable: protectedProcedure.input(z.string()).query(async ({ ctx, input: projectId }) => {
		const rows = (await ctx.withRLS((db) =>
			db
				.select({
					id: document.id,
					title: document.title,
					type: document.type,
					projectId: document.projectId,
					isPublic: document.isPublic,
					projectTitle: project.title // null when the project belongs to another user
				})
				.from(document)
				.leftJoin(project, eq(project.id, document.projectId))
				.where(ne(document.projectId, projectId))
				.orderBy(asc(project.title), asc(document.title))
		)) as {
			id: string;
			title: string;
			type: string;
			projectId: string;
			isPublic: boolean;
			projectTitle: string | null;
		}[];

		return rows;
	}),

	add: protectedProcedure
		.input(z.object({ projectId: z.string(), documentId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			// Verify the document exists and the user has access (RLS enforces this)
			const existing = (await ctx.withRLS((db) =>
				db
					.select({ id: projectContextLink.id })
					.from(projectContextLink)
					.where(
						and(
							eq(projectContextLink.projectId, input.projectId),
							eq(projectContextLink.linkedDocumentId, input.documentId)
						)
					)
					.limit(1)
			)) as { id: string }[];

			if (existing[0]) return existing[0]; // already linked, idempotent

			const rows = (await ctx.withRLS((db) =>
				db
					.insert(projectContextLink)
					.values({
						id: crypto.randomUUID(),
						projectId: input.projectId,
						linkedDocumentId: input.documentId
					})
					.returning({ id: projectContextLink.id })
			)) as { id: string }[];

			return rows[0];
		}),

	remove: protectedProcedure.input(z.string()).mutation(async ({ ctx, input: id }) => {
		const rows = (await ctx.withRLS((db) =>
			db
				.delete(projectContextLink)
				.where(eq(projectContextLink.id, id))
				.returning({ id: projectContextLink.id })
		)) as { id: string }[];

		if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
		return rows[0];
	})
});
