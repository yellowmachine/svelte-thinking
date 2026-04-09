import type { RequestHandler } from './$types';
import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';

export const GET: RequestHandler = async ({ locals, cookies }) => {
  if (!locals.user) {
    redirect(302, '/login');
  }

  const state = crypto.randomUUID();

  cookies.set('or_state', state, {
    path: '/',
    httpOnly: true,
    secure: !dev,
    sameSite: 'lax',
    maxAge: 600
  });

  const callbackUrl = `${env.ORIGIN}/api/openrouter/callback`;
  const params = new URLSearchParams({ callback_url: callbackUrl, state });

  redirect(302, `https://openrouter.ai/auth?${params}`);
};
