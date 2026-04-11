import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { env } from '$env/dynamic/private';

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
			const res = await fetch(`${env.ORIGIN}/api/auth/reset-password`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ newPassword, token })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				return fail(400, { token, message: (body as { message?: string }).message ?? 'The link may have expired.' });
			}
		} catch (e) {
			console.error('[reset-password] unexpected error:', e);
			return fail(500, { token, message: 'Something went wrong. The link may have expired.' });
		}

		return { success: true };
	}
};
