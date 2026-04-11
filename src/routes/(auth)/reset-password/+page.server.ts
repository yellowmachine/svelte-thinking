import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { auth } from '$lib/server/auth';
import { APIError } from 'better-auth/api';

export const load: PageServerLoad = async (event) => {
	const token = event.url.searchParams.get('token');
	if (!token) redirect(302, '/forgot-password');
	return { token };
};

export const actions: Actions = {
	default: async (event) => {
		const data = await event.request.formData();
		const token = data.get('token')?.toString() ?? '';
		const newPassword = data.get('newPassword')?.toString() ?? '';
		const confirm = data.get('confirm')?.toString() ?? '';

		if (newPassword !== confirm) {
			return fail(400, { token, message: 'Passwords do not match' });
		}
		if (newPassword.length < 8) {
			return fail(400, { token, message: 'Password must be at least 8 characters' });
		}

		try {
			await auth.api.resetPassword({ body: { newPassword, token } });
		} catch (e) {
			if (e instanceof APIError) {
				return fail(400, { token, message: e.message });
			}
			return fail(500, { token, message: 'Something went wrong. The link may have expired.' });
		}

		return { success: true };
	}
};
