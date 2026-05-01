import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { user, twoFactor, session } from '$lib/server/db/auth.schema';
import { eq, ilike, or, desc } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const q = url.searchParams.get('q')?.trim() ?? '';

	const users = await db
		.select({
			id: user.id,
			name: user.name,
			email: user.email,
			twoFactorEnabled: user.twoFactorEnabled,
			createdAt: user.createdAt
		})
		.from(user)
		.where(q ? or(ilike(user.name, `%${q}%`), ilike(user.email, `%${q}%`)) : undefined)
		.orderBy(desc(user.createdAt))
		.limit(50);

	return { users, q };
};

export const actions: Actions = {
	disable2FA: async ({ request }) => {
		const data = await request.formData();
		const userId = data.get('userId')?.toString();
		if (!userId) return fail(400, { error: 'userId required' });

		await db.delete(twoFactor).where(eq(twoFactor.userId, userId));
		await db.update(user).set({ twoFactorEnabled: false }).where(eq(user.id, userId));
		// Revoke all sessions so the user must log in again with the new security state
		await db.delete(session).where(eq(session.userId, userId));

		return { ok: true };
	}
};
