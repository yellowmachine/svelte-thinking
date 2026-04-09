import type { RequestHandler } from './$types';
import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = async ({ locals, cookies }) => {
	if (!locals.user) redirect(302, '/login');

	// Anti-CSRF: store a random state in a short-lived cookie.
	// OpenRouter does not echo state back, but verifying the cookie still
	// exists on callback confirms it is the same browser session.
	const state = crypto.randomUUID();
	cookies.set('or_state', state, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 600 // 10 min
	});

	const callbackUrl = `${env.ORIGIN}/api/auth/openrouter/callback`;
	redirect(302, `https://openrouter.ai/auth?callback_url=${encodeURIComponent(callbackUrl)}`);
};
