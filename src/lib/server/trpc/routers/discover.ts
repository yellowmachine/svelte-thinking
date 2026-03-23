import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../init';
import { projectInterest } from '$lib/server/db/schemas/discover.schema';
import { project } from '$lib/server/db/schemas/projects.schema';

export const discoverRouter = router({
	// Fijar interés en el owner de un proyecto
	pin: protectedProcedure.input(z.string()).mutation(async ({ ctx, input: projectId }) => {
		// Valida que el proyecto existe y es buscable (superuser para leer sin RLS de colaborador)
		const proj = await ctx.db
			.select({ ownerId: project.ownerId, isSearchable: project.isSearchable })
			.from(project)
			.where(eq(project.id, projectId))
			.limit(1);

		if (!proj[0] || !proj[0].isSearchable) throw new TRPCError({ code: 'NOT_FOUND' });
		if (proj[0].ownerId === ctx.user.id) {
			throw new TRPCError({ code: 'BAD_REQUEST', message: 'No puedes marcar tu propio proyecto.' });
		}

		// withRLS para que la política INSERT verifique el contexto
		const [interest] = await ctx.withRLS((db) =>
			db
				.insert(projectInterest)
				.values({ id: crypto.randomUUID(), projectId, userId: ctx.user.id })
				.onConflictDoNothing()
				.returning()
		);

		return interest ?? null;
	}),

	// Quitar interés
	unpin: protectedProcedure.input(z.string()).mutation(async ({ ctx, input: projectId }) => {
		await ctx.withRLS((db) =>
			db
				.delete(projectInterest)
				.where(
					and(eq(projectInterest.projectId, projectId), eq(projectInterest.userId, ctx.user.id))
				)
		);
	})
});
