import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../init';
import { projectDataset } from '$lib/server/db/schemas/datasets.schema';
import { project } from '$lib/server/db/schemas/projects.schema';

export const datasetsRouter = router({
	list: protectedProcedure.input(z.string()).query(async ({ ctx, input: projectId }) => {
		return ctx.withRLS((db) =>
			db.select().from(projectDataset).where(eq(projectDataset.projectId, projectId))
		);
	}),

	// Resolves a "$ref": "dataset:filename.csv" to its public URL.
	// Called from MarkdownPreview before passing the spec to vega-embed.
	resolveRef: protectedProcedure
		.input(z.object({ projectId: z.string(), filename: z.string() }))
		.query(async ({ ctx, input }) => {
			// Verify access to project (RLS enforced)
			const [proj] = await ctx.withRLS((db) =>
				db
					.select({ id: project.id })
					.from(project)
					.where(eq(project.id, input.projectId))
					.limit(1)
			);
			if (!proj) throw new TRPCError({ code: 'NOT_FOUND', message: 'Proyecto no encontrado' });

			const [dataset] = await ctx.withRLS((db) =>
				db
					.select({ url: projectDataset.url, filename: projectDataset.filename })
					.from(projectDataset)
					.where(
						and(
							eq(projectDataset.projectId, input.projectId),
							eq(projectDataset.filename, input.filename)
						)
					)
					.limit(1)
			);

			if (!dataset) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: `Dataset "${input.filename}" no encontrado en el proyecto`
				});
			}

			return { url: dataset.url };
		}),

	delete: protectedProcedure.input(z.string()).mutation(async ({ ctx, input: datasetId }) => {
		const { deleteFile } = await import('$lib/server/storage');

		const [dataset] = await ctx.withRLS((db) =>
			db
				.select()
				.from(projectDataset)
				.where(
					and(eq(projectDataset.id, datasetId), eq(projectDataset.uploadedBy, ctx.user.id))
				)
				.limit(1)
		);
		if (!dataset) throw new TRPCError({ code: 'NOT_FOUND' });

		await deleteFile(dataset.key);
		await ctx.withRLS((db) =>
			db.delete(projectDataset).where(eq(projectDataset.id, datasetId))
		);

		return { id: datasetId };
	})
});
