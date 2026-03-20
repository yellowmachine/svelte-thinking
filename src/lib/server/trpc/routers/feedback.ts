import { z } from 'zod';
import { desc } from 'drizzle-orm';
import { router, protectedProcedure, publicProcedure } from '../init';
import { feedback } from '$lib/server/db/schemas/feedback.schema';

export const feedbackRouter = router({
	submit: protectedProcedure
		.input(z.object({
			message: z.string().min(1).max(2000),
			showName: z.boolean().default(false)
		}))
		.mutation(async ({ ctx, input }) => {
			const userName = input.showName ? (ctx.user.name ?? null) : null;
			await ctx.db.insert(feedback).values({
				id: crypto.randomUUID(),
				userId: ctx.user.id,
				message: input.message,
				showName: input.showName,
				userName
			});
			return { ok: true };
		}),

	list: publicProcedure.query(async ({ ctx }) => {
		return ctx.db
			.select({
				id: feedback.id,
				message: feedback.message,
				showName: feedback.showName,
				userName: feedback.userName,
				createdAt: feedback.createdAt
			})
			.from(feedback)
			.orderBy(desc(feedback.createdAt));
	})
});
