import { redirect } from '@sveltejs/kit';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { waitlist } from '$lib/server/db/schemas/waitlist.schema';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async (event) => {
	// Si ya tiene profile, no debería estar aquí
	if (event.locals.hasScholioProfile) redirect(302, '/projects');

	return {
		email: event.locals.user?.email ?? null
	};
};

export const actions: Actions = {
	joinWaitlist: async (event) => {
		const data = await event.request.formData();
		const email = data.get('email')?.toString().trim() ?? '';
		const name = data.get('name')?.toString().trim() ?? '';

		if (!email) return fail(400, { message: 'Email is required.' });

		const existing = await db
			.select({ id: waitlist.id, status: waitlist.status })
			.from(waitlist)
			.where(eq(waitlist.email, email))
			.limit(1);

		if (existing[0]) {
			if (existing[0].status === 'approved') {
				return {
					already: true,
					message: 'Your request has already been approved. Check your email.'
				};
			}
			return {
				already: true,
				message: "You're already on the waiting list. We'll be in touch soon."
			};
		}

		await db.insert(waitlist).values({
			id: crypto.randomUUID(),
			email,
			name: name || null,
			message: 'Solicitud desde /no-access'
		});

		return { ok: true };
	}
};
