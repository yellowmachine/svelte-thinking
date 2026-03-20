import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user!;
	return { user: { id: user.id, name: user.name, email: user.email, twoFactorEnabled: (user as Record<string, unknown>).twoFactorEnabled === true } };
};
