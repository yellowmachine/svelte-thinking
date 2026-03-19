import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { auth } from '$lib/server/auth';
import { APIError } from 'better-auth/api';

export const load: PageServerLoad = async (event) => {
	if (event.locals.user) redirect(302, '/projects');
	return {};
};

export const actions: Actions = {
	signInEmail: async (event) => {
		const data = await event.request.formData();
		const email = data.get('email')?.toString() ?? '';
		const password = data.get('password')?.toString() ?? '';
		const redirectTo = event.url.searchParams.get('redirect') ?? '/projects';

		try {
			await auth.api.signInEmail({ body: { email, password } });
		} catch (e) {
			if (e instanceof APIError) return fail(400, { message: e.message || 'Credenciales incorrectas' });
			return fail(500, { message: 'Error inesperado' });
		}

		redirect(302, redirectTo);
	},

	signInSocial: async (event) => {
		const data = await event.request.formData();
		const provider = data.get('provider')?.toString() ?? 'github';
		const redirectTo = event.url.searchParams.get('redirect') ?? '/projects';

		const result = await auth.api.signInSocial({
			body: { provider: provider as 'github', callbackURL: redirectTo }
		});

		if (result?.url) redirect(302, result.url);
		return fail(400, { message: 'Error al iniciar sesión con GitHub' });
	}
};
