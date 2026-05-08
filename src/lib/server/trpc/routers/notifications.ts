import { z } from 'zod';
import { and, eq, gt, lt, not, exists } from 'drizzle-orm';
import { router, protectedProcedure } from '../init';
import { notification, notificationDismissal } from '$lib/server/db/schemas/notifications.schema';

export const notificationsRouter = router({
	/**
	 * Returns active notifications the current user has NOT dismissed.
	 * "Active" = startsAt <= now <= expiresAt.
	 */
	listActive: protectedProcedure.query(async ({ ctx }) => {
		const now = new Date();
		return ctx.db
			.select({
				id: notification.id,
				message: notification.message,
				expiresAt: notification.expiresAt
			})
			.from(notification)
			.where(
				and(
					lt(notification.startsAt, now),
					gt(notification.expiresAt, now),
					not(
						exists(
							ctx.db
								.select({ one: notificationDismissal.notificationId })
								.from(notificationDismissal)
								.where(
									and(
										eq(notificationDismissal.notificationId, notification.id),
										eq(notificationDismissal.userId, ctx.user.id)
									)
								)
						)
					)
				)
			)
			.orderBy(notification.startsAt);
	}),

	dismiss: protectedProcedure
		.input(z.object({ notificationId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			await ctx.db
				.insert(notificationDismissal)
				.values({
					notificationId: input.notificationId,
					userId: ctx.user.id
				})
				.onConflictDoNothing();
			return { ok: true };
		})
});
