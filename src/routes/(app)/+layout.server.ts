import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	if (!event.locals.user) {
		const redirectParam = event.url.pathname !== '/' ? `?redirect=${event.url.pathname}` : '';
		redirect(302, `/login${redirectParam}`);
	}

	return {
		user: {
			id: event.locals.user.id,
			name: event.locals.user.name,
			email: event.locals.user.email
		}
	};
};
