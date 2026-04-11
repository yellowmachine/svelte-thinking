import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { auth } from '$lib/server/auth';
import { APIError } from 'better-auth/api';

export const load: PageServerLoad = async (event) => {
	if (event.locals.user) return { redirect: '/projects' };
	return {};
};

export const actions: Actions = {
	default: async (event) => {
		const data = await event.request.formData();
		const email = data.get('email')?.toString() ?? '';

		if (!email) return fail(400, { message: 'Email is required' });

		try {
			await auth.api.forgetPassword({
				body: { email, redirectTo: '/reset-password' }
			});
		} catch (e) {
			if (e instanceof APIError) {
				return fail(400, { message: e.message });
			}
			console.error('[forgot-password] unexpected error:', e);
			// Don't leak whether the email exists — always show success
		}

		return { sent: true, email };
	}
};
