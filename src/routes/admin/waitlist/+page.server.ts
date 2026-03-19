import { fail } from '@sveltejs/kit';
import { eq, desc } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { waitlist } from '$lib/server/db/schemas/waitlist.schema';
import { env } from '$env/dynamic/private';
import { sendWaitlistApprovalEmail } from '$lib/server/resend';

export const load: PageServerLoad = async () => {
	const entries = await db
		.select()
		.from(waitlist)
		.orderBy(desc(waitlist.createdAt));
	return { entries };
};

export const actions: Actions = {
	approve: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id')?.toString();
		if (!id) return fail(400, { error: 'ID requerido' });

		const token = crypto.randomUUID();
		const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 días

		const rows = await db
			.update(waitlist)
			.set({ status: 'approved', registrationToken: token, tokenExpiresAt: expiresAt })
			.where(eq(waitlist.id, id))
			.returning({ email: waitlist.email, name: waitlist.name });

		if (!rows[0]) return fail(404, { error: 'Entrada no encontrada' });

		const origin = env.ORIGIN ?? 'http://localhost:3000';
		await sendWaitlistApprovalEmail({
			to: rows[0].email,
			name: rows[0].name ?? 'Investigador',
			registrationUrl: `${origin}/register?token=${token}`
		});

		return { ok: true };
	},

	reject: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id')?.toString();
		if (!id) return fail(400, { error: 'ID requerido' });

		await db.update(waitlist).set({ status: 'rejected' }).where(eq(waitlist.id, id));
		return { ok: true };
	}
};
