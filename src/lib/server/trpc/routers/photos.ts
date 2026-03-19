import { z } from 'zod';
import { eq, desc, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../init';
import { projectPhoto } from '$lib/server/db/schemas/photos.schema';
import { deleteFile } from '$lib/server/storage';

export const photosRouter = router({
	list: protectedProcedure.input(z.string()).query(async ({ ctx, input: projectId }) => {
		return ctx.withRLS((db) =>
			db
				.select()
				.from(projectPhoto)
				.where(eq(projectPhoto.projectId, projectId))
				.orderBy(desc(projectPhoto.createdAt))
		);
	}),

	delete: protectedProcedure.input(z.string()).mutation(async ({ ctx, input: photoId }) => {
		const rows = await ctx.withRLS((db) =>
			db.select().from(projectPhoto).where(eq(projectPhoto.id, photoId)).limit(1)
		);

		const photo = rows[0];
		if (!photo) throw new TRPCError({ code: 'NOT_FOUND' });

		// Only the uploader or owner can delete
		if (photo.uploadedBy !== ctx.user.id) {
			throw new TRPCError({ code: 'FORBIDDEN' });
		}

		await deleteFile(photo.key);

		await ctx.withRLS((db) =>
			db.delete(projectPhoto).where(and(eq(projectPhoto.id, photoId)))
		);

		return { id: photoId };
	})
});
