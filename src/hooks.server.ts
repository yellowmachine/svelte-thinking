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
import { env } from '$env/dynamic/private';

// The adapter has no instrumentation.server.ts support, so Sentry starts here,
// before any handle runs. Without SENTRY_DSN it stays off.
Sentry.init({
	dsn: env.SENTRY_DSN,
	enabled: !!env.SENTRY_DSN,
	tracesSampleRate: 0.2,
	environment: dev ? 'development' : 'production'
});

export const handleError = Sentry.handleErrorWithSentry();

const handleDevTools: Handle = ({ event, resolve }) => {
	if (event.url.pathname === '/.well-known/appspecific/com.chrome.devtools.json') {
		return new Response(null, { status: 204 });
	}
	return resolve(event);
};

// Añade cabeceras de seguridad a todas las respuestas HTML
const handleHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	// Solo aplicar a respuestas HTML (no a assets, API, etc.)
	const contentType = response.headers.get('content-type') ?? '';
	if (!contentType.includes('text/html')) return response;

	const headers = new Headers(response.headers);

	// El framework no siempre declara el charset en la cabecera HTTP (solo vía
	// <meta charset> dentro del HTML). Los navegadores hacen sniffing y no lo
	// notan, pero clientes no-navegador más estrictos (scrapers, servicios de
	// "leer más tarde") pueden asumir Latin-1 por defecto y corromper cualquier
	// acento/ñ/¿¡ — declararlo explícito aquí lo evita.
	if (!contentType.includes('charset')) {
		headers.set('Content-Type', 'text/html; charset=utf-8');
	}

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
	const sentryIngest = 'https://*.ingest.de.sentry.io https://*.sentry.io';
	const csp = dev
		? [
				"default-src 'self'",
				"script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Vite HMR necesita eval
				"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
				"img-src 'self' data: blob: https://upload.wikimedia.org https://www.gravatar.com",
				"font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net",
				`connect-src 'self' ws: wss: ${sentryIngest}`, // WebSocket de HMR + Sentry
				"worker-src 'self' blob:", // 'self' for SW, blob: for Sentry Session Replay
				"frame-ancestors 'none'"
			].join('; ')
		: [
				"default-src 'self'",
				"script-src 'self' 'unsafe-inline'", // SvelteKit necesita inline scripts para hydration
				"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
				"img-src 'self' data: blob: https://upload.wikimedia.org https://www.gravatar.com",
				"font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net",
				`connect-src 'self' ${sentryIngest}`,
				"worker-src 'self' blob:", // 'self' for SW, blob: for Sentry Session Replay
				"frame-ancestors 'none'"
			].join('; ');

	headers.set('Content-Security-Policy', csp);

	return new Response(response.body, { status: response.status, headers });
};

const handleAuthError: Handle = ({ event, resolve }) => {
	if (event.url.pathname === '/api/auth/error') {
		const error = event.url.searchParams.get('error') ?? '';
		return new Response(null, {
			status: 302,
			headers: { location: `/auth/error?error=${encodeURIComponent(error)}` }
		});
	}
	return resolve(event);
};

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;

		const profile = await db.transaction(async (tx) => {
			await tx.execute(sql`SELECT set_config('app.current_user_id', ${session.user.id}, true)`);
			return tx
				.select({ id: userProfile.id })
				.from(userProfile)
				.where(eq(userProfile.userId, session.user.id))
				.limit(1);
		});

		event.locals.hasScholioProfile = profile.length > 0;
	} else {
		event.locals.hasScholioProfile = false;
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

// /admin: the check in admin/+layout.server.ts only runs for page loads, and
// SvelteKit runs form actions before any load. This guard covers every request
// (GET, POST to ?/action, __data.json) before it reaches the route.
const handleAdminGuard: Handle = ({ event, resolve }) => {
	const path = event.url.pathname;
	if (path === '/admin' || path.startsWith('/admin/')) {
		const adminEmail = env.ADMIN_EMAIL;
		if (!adminEmail) error(503, 'ADMIN_EMAIL not configured');
		if (!event.locals.user) error(401, 'Not authenticated');
		if (event.locals.user.email !== adminEmail) error(403, 'Forbidden');
	}
	return resolve(event);
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
	handleDevTools,
	handleAuthError,
	handleBetterAuth,
	handleAdminGuard,
	handleRLS,
	handleHeaders
);
