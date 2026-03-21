import { fail, redirect, error } from '@sveltejs/kit';
import { eq, and, gt } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { waitlist } from '$lib/server/db/schemas/waitlist.schema';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { user } from '$lib/server/db/auth.schema';
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

		let userId: string;
		try {
			const result = await auth.api.signUpEmail({
				body: { name, email, password, callbackURL: '/projects' }
			});
			userId = result.user.id;
		} catch (e) {
			if (e instanceof APIError) {
				const isEmailTaken = e.body?.code === 'USER_ALREADY_EXISTS' || e.message?.toLowerCase().includes('already exists') || e.message?.toLowerCase().includes('email');

				if (isEmailTaken) {
					// El usuario ya existe en public.user (cuenta de Librarian u otra app).
					// Creamos el user_profile en scholio si no existe y le pedimos que haga login.
					const existingUser = await db
						.select({ id: user.id })
						.from(user)
						.where(eq(user.email, email))
						.limit(1);

					if (existingUser[0]) {
						const existingProfile = await db
							.select({ id: userProfile.id })
							.from(userProfile)
							.where(eq(userProfile.userId, existingUser[0].id))
							.limit(1);

						if (!existingProfile[0]) {
							await db.insert(userProfile).values({
								id: crypto.randomUUID(),
								userId: existingUser[0].id,
								displayName: name
							});
						}
					}

					// Invalidar el token igualmente para que no se reutilice
					await db
						.update(waitlist)
						.set({ registrationToken: null, tokenExpiresAt: null })
						.where(eq(waitlist.id, rows[0].id));

					redirect(302, `/login?welcome=1&email=${encodeURIComponent(email)}`);
				}

				return fail(400, { message: e.message || 'Error al crear la cuenta' });
			}
			return fail(500, { message: 'Error inesperado' });
		}

		await db.insert(userProfile).values({
			id: crypto.randomUUID(),
			userId,
			displayName: name
		});

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
