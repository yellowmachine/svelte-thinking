import * as Sentry from '@sentry/sveltekit';
import { sequence } from '@sveltejs/kit/hooks';
import type { Handle } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { building } from '$app/environment';
import { sql } from 'drizzle-orm';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { svelteKitHandler } from 'better-auth/svelte-kit';

export const handleError = Sentry.handleErrorWithSentry();

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

const handleRLS: Handle = ({ event, resolve }) => {
	const userId = event.locals.user?.id;

	event.locals.withRLS = (fn) => {
		if (!userId) {
			error(401, 'Unauthorized');
		}

		return db.transaction(async (tx) => {
			// set_config con is_local=true equivale a SET LOCAL — solo aplica en esta transacción
			await tx.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
			return fn(tx as unknown as typeof db);
		});
	};

	return resolve(event);
};

export const handle: Handle = sequence(
	Sentry.sentryHandle(),
	handleBetterAuth,
	handleRLS
);
