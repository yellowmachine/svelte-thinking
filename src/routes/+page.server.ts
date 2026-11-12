import { fail, redirect } from '@sveltejs/kit';
import { eq, count } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { waitlist } from '$lib/server/db/schemas/waitlist.schema';
import { user } from '$lib/server/db/auth.schema';
import { notifySlack } from '$lib/server/slack';
import { cacheGet, cacheSet } from '$lib/server/cache';
import { sendWaitlistWelcomeEmail } from '$lib/server/email';
import { hitRateLimit, RATE_LIMITS } from '$lib/server/rateLimit';

const USER_COUNT_KEY = 'scholio:stats:user_count';
const USER_COUNT_TTL = 15 * 60; // 15 min

async function getUserCount(): Promise<number> {
	const cached = await cacheGet<number>(USER_COUNT_KEY);
	if (cached !== null) return cached;

	const [{ value }] = await db.select({ value: count() }).from(user);
	await cacheSet(USER_COUNT_KEY, value, USER_COUNT_TTL);
	return value;
}

export const load: PageServerLoad = async (event) => {
	if (event.locals.user) redirect(302, '/projects');
	const userCount = await getUserCount();
	return { userCount };
};

export const actions: Actions = {
	joinWaitlist: async ({ request, getClientAddress }) => {
		const { allowed } = await hitRateLimit(RATE_LIMITS.waitlist, getClientAddress());
		if (!allowed) return fail(429, { error: 'Too many attempts. Try again later.' });

		const data = await request.formData();
		const name = data.get('name')?.toString().trim() ?? '';
		const email = data.get('email')?.toString().trim().toLowerCase() ?? '';
		const message = data.get('message')?.toString().trim() ?? '';

		if (!email || !name) return fail(400, { error: 'Name and email are required.' });
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, { error: 'Invalid email.' });

		const existing = await db
			.select({ id: waitlist.id, status: waitlist.status })
			.from(waitlist)
			.where(eq(waitlist.email, email))
			.limit(1);

		// Ya en la lista (pendiente, aprobado o rechazado): la misma respuesta que a
		// un email nuevo, para que el formulario no sirva para saber quién tiene cuenta.
		if (existing[0]) return { success: true, email };

		await db.insert(waitlist).values({
			id: crypto.randomUUID(),
			email,
			name: name || null,
			message: message || null
		});

		notifySlack({ type: 'waitlist_signup', name: name || email, email });
		// No bloquear la respuesta: el registro ya está guardado aunque falle el SMTP.
		sendWaitlistWelcomeEmail({ to: email, name: name || 'there' }).catch((err) =>
			console.error(`[waitlist] Welcome email to ${email} failed:`, err)
		);
		return { success: true, email };
	}
};
