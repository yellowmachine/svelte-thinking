import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { auth, seilide } from '$lib/server/auth';
import { APIError } from 'better-auth/api';

export const load: PageServerLoad = async (event) => {
	if (event.locals.user) redirect(302, '/projects');
	return {
		welcome: event.url.searchParams.get('welcome') === '1',
		prefillEmail: event.url.searchParams.get('email') ?? null,
		seilide: seilide !== null
	};
};

export const actions: Actions = {
	signInEmail: async (event) => {
		const data = await event.request.formData();
		const email = data.get('email')?.toString() ?? '';
		const password = data.get('password')?.toString() ?? '';
		const redirectTo = event.url.searchParams.get('redirect') ?? '/projects';

		try {
			const result = await auth.api.signInEmail({ body: { email, password } });

			// If 2FA is required, Better Auth returns { twoFactorRedirect: true }
			// The two-factor cookie is set automatically via sveltekitCookies plugin
			if (
				result &&
				typeof result === 'object' &&
				'twoFactorRedirect' in result &&
				result.twoFactorRedirect
			) {
				return { twoFactor: true, email };
			}
		} catch (e) {
			if (e instanceof APIError) {
				const isUnverified =
					e.message?.toLowerCase().includes('email') && e.message?.toLowerCase().includes('verif');
				if (isUnverified) {
					return fail(400, {
						message: 'You need to verify your email before signing in.',
						unverified: true,
						email
					});
				}
				return fail(400, { message: e.message || 'Incorrect email or password' });
			}
			return fail(500, { message: 'Unexpected error' });
		}

		redirect(302, redirectTo);
	},

	verifyTotp: async (event) => {
		const data = await event.request.formData();
		const code = data.get('code')?.toString() ?? '';
		const redirectTo = event.url.searchParams.get('redirect') ?? '/projects';

		try {
			await auth.api.verifyTOTP({
				body: { code },
				headers: event.request.headers
			});
		} catch (e) {
			if (e instanceof APIError) {
				return fail(400, { twoFactor: true, message: e.message || 'Incorrect code' });
			}
			return fail(400, { twoFactor: true, message: 'Incorrect code. Try again.' });
		}

		redirect(302, redirectTo);
	},

	signInSeilide: async (event) => {
		if (!seilide) return fail(404, { message: 'Seilide sign-in is not configured' });
		const redirectTo = event.url.searchParams.get('redirect') ?? '/projects';

		const result = await auth.api.signInWithOAuth2({
			body: { providerId: 'seilide', callbackURL: redirectTo }
		});

		if (result?.url) redirect(302, result.url);
		return fail(400, { message: "Couldn't sign in with Seilide" });
	}
};
