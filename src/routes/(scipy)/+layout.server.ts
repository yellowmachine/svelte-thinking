import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { dev } from '$app/environment';

export const load: LayoutServerLoad = async (event) => {
	if (!event.locals.user) {
		// En dev (localhost) el login es local; en prod redirige al dominio principal
		const loginBase = dev ? '' : 'https://scholio.review';
		const returnTo = encodeURIComponent(event.url.href);
		redirect(302, `${loginBase}/login?redirect=${returnTo}`);
	}

	if (!event.locals.hasScholioProfile) {
		redirect(302, dev ? '/no-access' : 'https://scholio.review/no-access');
	}

	return {
		user: {
			id: event.locals.user.id,
			name: event.locals.user.name,
			email: event.locals.user.email
		}
	};
};
