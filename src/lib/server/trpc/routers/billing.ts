import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../init';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { getStripe, PLANS, type PlanId } from '$lib/server/stripe';
import { env } from '$env/dynamic/private';

export const billingRouter = router({
	// Current plan info
	currentPlan: protectedProcedure.query(async ({ ctx }) => {
		const rows = await ctx.withRLS((db) =>
			db
				.select({
					plan: userProfile.plan,
					planStatus: userProfile.planStatus,
					planCurrentPeriodEnd: userProfile.planCurrentPeriodEnd,
					stripeCustomerId: userProfile.stripeCustomerId
				})
				.from(userProfile)
				.where(eq(userProfile.userId, ctx.user.id))
				.limit(1)
		) as {
			plan: string;
			planStatus: string | null;
			planCurrentPeriodEnd: Date | null;
			stripeCustomerId: string | null;
		}[];

		return rows[0] ?? { plan: 'free', planStatus: 'active', planCurrentPeriodEnd: null, stripeCustomerId: null };
	}),

	// Create Stripe Checkout session to upgrade
	createCheckoutSession: protectedProcedure
		.input(z.object({ plan: z.enum(['pro', 'team']) }))
		.mutation(async ({ ctx, input }) => {
			const stripe = getStripe();
			const origin = env.ORIGIN ?? 'http://localhost:5174';

			// Get or create Stripe customer
			const rows = await ctx.withRLS((db) =>
				db
					.select({ stripeCustomerId: userProfile.stripeCustomerId })
					.from(userProfile)
					.where(eq(userProfile.userId, ctx.user.id))
					.limit(1)
			) as { stripeCustomerId: string | null }[];

			let customerId = rows[0]?.stripeCustomerId ?? null;

			if (!customerId) {
				const customer = await stripe.customers.create({
					email: ctx.user.email,
					name: ctx.user.name,
					metadata: { userId: ctx.user.id }
				});
				customerId = customer.id;

				await ctx.withRLS((db) =>
					db
						.update(userProfile)
						.set({ stripeCustomerId: customerId })
						.where(eq(userProfile.userId, ctx.user.id))
				);
			}

			const priceId = PLANS[input.plan as PlanId].priceId();
			if (!priceId) {
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: `Price ID para el plan ${input.plan} no configurado.`
				});
			}

			const session = await stripe.checkout.sessions.create({
				customer: customerId,
				mode: 'subscription',
				line_items: [{ price: priceId, quantity: 1 }],
				success_url: `${origin}/settings?billing=success`,
				cancel_url: `${origin}/settings?billing=cancelled`,
				allow_promotion_codes: true
			});

			return { url: session.url };
		}),

	// Open Stripe Customer Portal (manage/cancel subscription)
	createPortalSession: protectedProcedure.mutation(async ({ ctx }) => {
		const stripe = getStripe();
		const origin = env.ORIGIN ?? 'http://localhost:5174';

		const rows = await ctx.withRLS((db) =>
			db
				.select({ stripeCustomerId: userProfile.stripeCustomerId })
				.from(userProfile)
				.where(eq(userProfile.userId, ctx.user.id))
				.limit(1)
		) as { stripeCustomerId: string | null }[];

		const customerId = rows[0]?.stripeCustomerId;
		if (!customerId) {
			throw new TRPCError({
				code: 'BAD_REQUEST',
				message: 'No tienes una suscripción activa.'
			});
		}

		const session = await stripe.billingPortal.sessions.create({
			customer: customerId,
			return_url: `${origin}/settings`
		});

		return { url: session.url };
	})
});
