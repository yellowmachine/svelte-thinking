import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	const adminEmail = env.ADMIN_EMAIL;
	if (!adminEmail) throw error(503, 'ADMIN_EMAIL not configured');
	if (!event.locals.user) throw error(401, 'No autenticado');
	if (event.locals.user.email !== adminEmail) throw error(403, 'Acceso denegado');

	// Helper que activa app.is_admin = 'true' para que la policy user_profile_admin
	// permita SELECT/UPDATE en cualquier fila, sin necesidad de BYPASSRLS.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	event.locals.withAdminRLS = <T>(fn: (tx: any) => Promise<T>): Promise<T> =>
		db.transaction(async (tx) => {
			await tx.execute(sql`SELECT set_config('app.is_admin', 'true', true)`);
			await tx.execute(sql`SET LOCAL search_path = scholio, public`);
			return fn(tx);
		});

	return {};
};
