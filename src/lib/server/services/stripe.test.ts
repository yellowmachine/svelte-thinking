import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, type TestDb } from '$lib/server/db/test-utils';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { resolvePlan, handleStripeEvent } from './stripe.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PRICE_PRO = 'price_pro_monthly';
const PRICE_TEAM = 'price_team_monthly';
const PRICES = { pro: PRICE_PRO, team: PRICE_TEAM };

const CUSTOMER_A = 'cus_test_a';
const USER_A = 'stripe-user-a';

let db: TestDb;

beforeAll(async () => {
	db = await createTestDb();

	await db.insert(userProfile).values({
		id: USER_A,
		userId: USER_A,
		displayName: 'User A',
		stripeCustomerId: CUSTOMER_A
	});
}, 30_000);

// ── resolvePlan ───────────────────────────────────────────────────────────────

describe('resolvePlan', () => {
	it('price pro → plan pro', () => {
		expect(resolvePlan(PRICE_PRO, PRICES)).toBe('pro');
	});

	it('price team → plan team', () => {
		expect(resolvePlan(PRICE_TEAM, PRICES)).toBe('team');
	});

	it('price desconocido → free', () => {
		expect(resolvePlan('price_unknown_xyz', PRICES)).toBe('free');
	});

	it('undefined → free', () => {
		expect(resolvePlan(undefined, PRICES)).toBe('free');
	});
});

// ── handleStripeEvent ─────────────────────────────────────────────────────────

describe('handleStripeEvent: customer.subscription.updated', () => {
	it('actualiza plan y periodo en la BD', async () => {
		const periodEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;

		await handleStripeEvent(
			db as never,
			{
				type: 'customer.subscription.updated',
				data: {
					object: {
						customer: CUSTOMER_A,
						status: 'active',
						items: { data: [{ price: { id: PRICE_PRO }, current_period_end: periodEnd }] }
					}
				}
			},
			PRICES,
			userProfile
		);

		const [row] = await db
			.select({ plan: userProfile.plan, planStatus: userProfile.planStatus })
			.from(userProfile)
			.where(eq(userProfile.stripeCustomerId, CUSTOMER_A));

		expect(row.plan).toBe('pro');
		expect(row.planStatus).toBe('active');
	});
});

describe('handleStripeEvent: customer.subscription.deleted', () => {
	it('resetea a free y marca canceled', async () => {
		await handleStripeEvent(
			db as never,
			{
				type: 'customer.subscription.deleted',
				data: { object: { customer: CUSTOMER_A } }
			},
			PRICES,
			userProfile
		);

		const [row] = await db
			.select({ plan: userProfile.plan, planStatus: userProfile.planStatus, periodEnd: userProfile.planCurrentPeriodEnd })
			.from(userProfile)
			.where(eq(userProfile.stripeCustomerId, CUSTOMER_A));

		expect(row.plan).toBe('free');
		expect(row.planStatus).toBe('canceled');
		expect(row.periodEnd).toBeNull();
	});
});
