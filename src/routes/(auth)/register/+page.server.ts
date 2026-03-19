import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { auth } from '$lib/server/auth';
import { APIError } from 'better-auth/api';

export const load: PageServerLoad = async (event) => {
	if (event.locals.user) redirect(302, '/projects');
	return {};
};

export const actions: Actions = {
	signUpEmail: async (event) => {
		const data = await event.request.formData();
		const name = data.get('name')?.toString() ?? '';
		const email = data.get('email')?.toString() ?? '';
		const password = data.get('password')?.toString() ?? '';

		try {
			await auth.api.signUpEmail({ body: { name, email, password } });
		} catch (e) {
			if (e instanceof APIError) return fail(400, { message: e.message || 'Error al crear la cuenta' });
			return fail(500, { message: 'Error inesperado' });
		}

		redirect(302, '/projects');
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
