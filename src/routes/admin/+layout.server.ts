import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	const adminEmail = env.ADMIN_EMAIL;
	if (!adminEmail) throw error(503, 'ADMIN_EMAIL not configured');
	if (!event.locals.user) throw error(401, 'No autenticado');
	if (event.locals.user.email !== adminEmail) throw error(403, 'Acceso denegado');
	return {};
};
