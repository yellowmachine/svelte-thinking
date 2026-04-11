import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { env } from '$env/dynamic/private';

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
			await fetch(`${env.ORIGIN}/api/auth/request-password-reset`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, redirectTo: '/reset-password' })
			});
		} catch (e) {
			console.error('[forgot-password] unexpected error:', e);
			// Don't leak whether the email exists — always show success
		}

		return { sent: true, email };
	}
};
