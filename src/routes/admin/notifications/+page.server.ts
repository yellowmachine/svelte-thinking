import { fail } from '@sveltejs/kit';
import { eq, desc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { notification } from '$lib/server/db/schemas/notifications.schema';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const notifications = await db.select().from(notification).orderBy(desc(notification.createdAt));

	return { notifications, adminEmail: locals.user!.email };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const data = await request.formData();
		const message = data.get('message')?.toString().trim();
		const startsAt = data.get('startsAt')?.toString();
		const ttlHours = Number(data.get('ttlHours'));

		if (!message || !startsAt || !ttlHours || ttlHours <= 0) {
			return fail(400, { error: 'All fields are required and TTL must be positive.' });
		}

		const start = new Date(startsAt);
		if (isNaN(start.getTime())) return fail(400, { error: 'Invalid start date.' });

		const expires = new Date(start.getTime() + ttlHours * 60 * 60 * 1000);

		await db.insert(notification).values({
			id: crypto.randomUUID(),
			message,
			startsAt: start,
			expiresAt: expires,
			createdBy: locals.user!.email
		});

		return { ok: true };
	},

	delete: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id')?.toString();
		if (!id) return fail(400, { error: 'ID required.' });

		await db.delete(notification).where(eq(notification.id, id));
		return { ok: true };
	}
};
