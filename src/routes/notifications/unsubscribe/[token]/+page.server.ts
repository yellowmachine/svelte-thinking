import { db } from '$lib/server/db';
import { notificationPreference } from '$lib/server/db/schemas/users.schema';
import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const rows = await db
		.select({ id: notificationPreference.id, commentEmails: notificationPreference.commentEmails })
		.from(notificationPreference)
		.where(eq(notificationPreference.unsubscribeToken, params.token))
		.limit(1);

	if (!rows[0]) error(404, 'Enlace no válido');

	if (rows[0].commentEmails) {
		await db
			.update(notificationPreference)
			.set({ commentEmails: false, updatedAt: new Date() })
			.where(eq(notificationPreference.id, rows[0].id));
	}

	return { alreadyUnsubscribed: !rows[0].commentEmails };
};
