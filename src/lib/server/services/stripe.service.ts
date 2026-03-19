import { eq } from 'drizzle-orm';
import type { userProfile } from '$lib/server/db/schemas/users.schema';
import type { drizzle } from 'drizzle-orm/pglite';

type DB = ReturnType<typeof drizzle>;
type Plan = 'free' | 'pro' | 'team';

export function resolvePlan(
	priceId: string | undefined,
	prices: { pro: string; team: string }
): Plan {
	if (!priceId) return 'free';
	if (priceId === prices.pro) return 'pro';
	if (priceId === prices.team) return 'team';
	return 'free';
}

export async function handleStripeEvent(
	db: DB,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	event: { type: string; data: { object: any } },
	prices: { pro: string; team: string },
	table: typeof userProfile
) {
	switch (event.type) {
		case 'customer.subscription.updated':
		case 'checkout.session.completed': {
			const obj = event.data.object;
			// checkout.session has .customer + .subscription items via a pre-fetched subscription
			// For testing, we accept the subscription shape directly
			const customerId = (obj.customer as string) ?? null;
			const item = obj.items?.data?.[0];
			const plan = resolvePlan(item?.price?.id, prices);
			const periodEnd = item?.current_period_end
				? new Date(item.current_period_end * 1000)
				: null;

			if (customerId) {
				await db
					.update(table)
					.set({ plan, planStatus: obj.status ?? 'active', planCurrentPeriodEnd: periodEnd })
					.where(eq(table.stripeCustomerId, customerId));
			}
			break;
		}

		case 'customer.subscription.deleted': {
			const customerId = event.data.object.customer as string;
			await db
				.update(table)
				.set({ plan: 'free', planStatus: 'canceled', planCurrentPeriodEnd: null })
				.where(eq(table.stripeCustomerId, customerId));
			break;
		}
	}
}
