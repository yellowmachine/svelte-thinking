import * as Sentry from '@sentry/sveltekit';
import { sequence } from '@sveltejs/kit/hooks';
import type { Handle } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { building, dev } from '$app/environment';
import { sql } from 'drizzle-orm';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { eq } from 'drizzle-orm';
import { svelteKitHandler } from 'better-auth/svelte-kit';

export const handleError = Sentry.handleErrorWithSentry();

// Añade cabeceras de seguridad a todas las respuestas HTML
const handleHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	// Solo aplicar a respuestas HTML (no a assets, API, etc.)
	const contentType = response.headers.get('content-type') ?? '';
	if (!contentType.includes('text/html')) return response;

	const headers = new Headers(response.headers);

	// Evita que el navegador "adivine" el MIME type
	headers.set('X-Content-Type-Options', 'nosniff');

	// Bloquea iframes desde otros dominios (clickjacking)
	headers.set('X-Frame-Options', 'SAMEORIGIN');

	// Controla qué información de referencia se envía al navegar
	headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

	// Fuerza HTTPS en producción (1 año, incluye subdominios)
	if (!dev) {
		headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}

	// Content Security Policy
	// En dev se relaja para permitir HMR de Vite (ws:// y eval)
	const csp = dev
		? [
				"default-src 'self'",
				"script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Vite HMR necesita eval
				"style-src 'self' 'unsafe-inline'",
				"img-src 'self' data: blob:",
				"font-src 'self'",
				"connect-src 'self' ws: wss:", // WebSocket de HMR
				"frame-ancestors 'none'"
			].join('; ')
		: [
				"default-src 'self'",
				"script-src 'self' 'unsafe-inline'", // SvelteKit necesita inline scripts para hydration
				"style-src 'self' 'unsafe-inline'",
				"img-src 'self' data: blob:",
				"font-src 'self'",
				"connect-src 'self'",
				"frame-ancestors 'none'"
			].join('; ');

	headers.set('Content-Security-Policy', csp);

	return new Response(response.body, { status: response.status, headers });
};

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;

		const profile = await db
			.select({ id: userProfile.id })
			.from(userProfile)
			.where(eq(userProfile.userId, session.user.id))
			.limit(1);

		event.locals.hasScholioProfile = profile.length > 0;
	} else {
		event.locals.hasScholioProfile = false;
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
			// search_path para que las policies encuentren las tablas de scholio sin cualificar
			await tx.execute(sql`SET LOCAL search_path = scholio, public`);
			return fn(tx as unknown as typeof db);
		});
	};

	return resolve(event);
};

export const handle: Handle = sequence(
	Sentry.sentryHandle(),
	handleBetterAuth,
	handleRLS,
	handleHeaders
);
