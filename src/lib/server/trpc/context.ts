import type { RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/server/db';

export async function createContext(event: RequestEvent) {
	return {
		db,
		user: event.locals.user,
		session: event.locals.session,
		withRLS: event.locals.withRLS,
		event
	};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
