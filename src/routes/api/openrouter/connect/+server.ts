import type { RequestHandler } from './$types';
import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = async ({ locals, cookies }) => {

  if (!locals.user) {
    redirect(302, '/login');
  }

  const state = crypto.randomUUID();

  cookies.set('or_state', state, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 600
  });

  const callbackUrl = `${env.ORIGIN}/api/openrouter/callback`;

  redirect(
    302,
    `https://openrouter.ai/auth?callback_url=${encodeURIComponent(callbackUrl)}`
  );
};
