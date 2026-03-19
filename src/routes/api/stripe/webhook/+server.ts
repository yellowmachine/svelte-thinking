import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getStripe } from '$lib/server/stripe';
import { db } from '$lib/server/db';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const signature = request.headers.get('stripe-signature');
	if (!signature) throw error(400, 'Missing stripe-signature');

	const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
	if (!webhookSecret) throw error(500, 'STRIPE_WEBHOOK_SECRET not configured');

	const body = await request.text();
	const stripe = getStripe();

	let event;
	try {
		event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
	} catch {
		throw error(400, 'Invalid webhook signature');
	}

	switch (event.type) {
		case 'checkout.session.completed': {
			const session = event.data.object;
			const customerId = session.customer as string;
			const subscriptionId = session.subscription as string;

			if (session.mode === 'subscription' && customerId && subscriptionId) {
				// Fetch subscription to get price and plan details
				const subscription = await stripe.subscriptions.retrieve(subscriptionId);
				const item = subscription.items.data[0];
				const priceId = item?.price.id;

				// Determine plan from price ID
				const plan = resolvePlan(priceId);
				const periodEnd = item?.current_period_end
					? new Date(item.current_period_end * 1000)
					: null;

				await db
					.update(userProfile)
					.set({
						plan,
						planStatus: subscription.status,
						planCurrentPeriodEnd: periodEnd
					})
					.where(eq(userProfile.stripeCustomerId, customerId));
			}
			break;
		}

		case 'customer.subscription.updated': {
			const subscription = event.data.object;
			const customerId = subscription.customer as string;
			const item = subscription.items.data[0];
			const priceId = item?.price.id;
			const plan = resolvePlan(priceId);
			const periodEnd = item?.current_period_end
				? new Date(item.current_period_end * 1000)
				: null;

			await db
				.update(userProfile)
				.set({ plan, planStatus: subscription.status, planCurrentPeriodEnd: periodEnd })
				.where(eq(userProfile.stripeCustomerId, customerId));
			break;
		}

		case 'customer.subscription.deleted': {
			const subscription = event.data.object;
			const customerId = subscription.customer as string;

			await db
				.update(userProfile)
				.set({
					plan: 'free',
					planStatus: 'canceled',
					planCurrentPeriodEnd: null
				})
				.where(eq(userProfile.stripeCustomerId, customerId));
			break;
		}
	}

	return json({ received: true });
};

function resolvePlan(priceId: string | undefined): 'free' | 'pro' | 'team' {
	if (!priceId) return 'free';
	if (priceId === env.STRIPE_PRICE_PRO_MONTHLY) return 'pro';
	if (priceId === env.STRIPE_PRICE_TEAM_MONTHLY) return 'team';
	return 'free';
}
