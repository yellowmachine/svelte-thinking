import Stripe from 'stripe';
import { env } from '$env/dynamic/private';

export function getStripe(): Stripe {
	if (!env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY no configurada');
	return new Stripe(env.STRIPE_SECRET_KEY);
}

export const PLANS = {
	pro: {
		name: 'Pro',
		priceId: () => env.STRIPE_PRICE_PRO_MONTHLY ?? '',
		amount: 900 // cents
	},
	team: {
		name: 'Team',
		priceId: () => env.STRIPE_PRICE_TEAM_MONTHLY ?? '',
		amount: 2900
	}
} as const;

export type PlanId = keyof typeof PLANS;
