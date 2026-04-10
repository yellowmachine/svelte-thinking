import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { env } from '$env/dynamic/private';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
//import { sendVerificationEmail } from '$lib/server/resend';

// Deriva el dominio de cookie desde ORIGIN para compartirla entre subdominios.
// https://scholio.review → .scholio.review (cubre librarian.scholio.review)
// localhost → undefined (cookie sin domain, solo funciona en localhost)
function cookieDomain(origin: string): string | undefined {
  try {
    const { hostname } = new URL(origin);
    if (hostname === 'localhost' || hostname === '127.0.0.1') return undefined;
    const parts = hostname.split('.');
    return parts.length >= 2 ? '.' + parts.slice(-2).join('.') : undefined;
  } catch {
    return undefined;
  }
}

const domain = cookieDomain(env.ORIGIN);

export const auth = betterAuth({
  baseURL: env.ORIGIN,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: 'pg' }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
  /*emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail(user.email, url);
    }
  },
  */
  socialProviders: {
    github: {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET
    }
  },
  ...(domain
    ? {
        advanced: {
          cookies: {
            session_token: {
              attributes: { domain, sameSite: 'lax' as const, secure: true }
            }
          }
        }
      }
    : {}),
  plugins: [
    twoFactor({ issuer: 'Scholio' }),
    sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
  ]
});
