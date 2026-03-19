import { fail, redirect, error } from '@sveltejs/kit';
import { eq, and, gt } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { waitlist } from '$lib/server/db/schemas/waitlist.schema';
import { APIError } from 'better-auth/api';

export const load: PageServerLoad = async (event) => {
	if (event.locals.user) redirect(302, '/projects');

	const token = event.url.searchParams.get('token');
	if (!token) throw error(403, 'Registro cerrado. Solicita acceso en la página principal.');

	const rows = await db
		.select({ id: waitlist.id, email: waitlist.email, name: waitlist.name })
		.from(waitlist)
		.where(
			and(
				eq(waitlist.registrationToken, token),
				eq(waitlist.status, 'approved'),
				gt(waitlist.tokenExpiresAt, new Date())
			)
		)
		.limit(1);

	if (!rows[0]) throw error(403, 'El enlace de registro no es válido o ha expirado.');

	return { token, email: rows[0].email, name: rows[0].name };
};

export const actions: Actions = {
	signUpEmail: async (event) => {
		const data = await event.request.formData();
		const token = data.get('token')?.toString() ?? '';
		const name = data.get('name')?.toString() ?? '';
		const email = data.get('email')?.toString() ?? '';
		const password = data.get('password')?.toString() ?? '';

		// Re-validate token on submit
		const rows = await db
			.select({ id: waitlist.id })
			.from(waitlist)
			.where(
				and(
					eq(waitlist.registrationToken, token),
					eq(waitlist.status, 'approved'),
					gt(waitlist.tokenExpiresAt, new Date())
				)
			)
			.limit(1);

		if (!rows[0]) return fail(403, { message: 'El enlace de registro no es válido o ha expirado.' });

		try {
			await auth.api.signUpEmail({
				body: { name, email, password, callbackURL: '/projects' }
			});
		} catch (e) {
			if (e instanceof APIError) return fail(400, { message: e.message || 'Error al crear la cuenta' });
			return fail(500, { message: 'Error inesperado' });
		}

		// Invalidate token so it can't be reused
		await db
			.update(waitlist)
			.set({ registrationToken: null, tokenExpiresAt: null })
			.where(eq(waitlist.id, rows[0].id));

		redirect(302, `/check-email?email=${encodeURIComponent(email)}`);
	},

	signInSocial: async (event) => {
		const data = await event.request.formData();
		const provider = data.get('provider')?.toString() ?? 'github';

		const result = await auth.api.signInSocial({
			body: { provider: provider as 'github', callbackURL: '/projects' }
		});

		if (result?.url) redirect(302, result.url);
		return fail(400, { message: 'Error al iniciar sesión con GitHub' });
	}
};
