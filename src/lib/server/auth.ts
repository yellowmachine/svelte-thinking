import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { env } from '$env/dynamic/private';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
//import { sendVerificationEmail } from '$lib/server/resend';

// En producción activa crossSubDomainCookies para compartir la sesión con
// librarian.scholio.review. better-auth usa el hostname de baseURL como domain
// automáticamente (scholio.review), lo que cubre todos sus subdominios.
// En localhost no se activa: cookie sin domain, solo funciona en localhost.
function isLocalhost(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return true;
  }
}

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
  advanced: {
    ...(!isLocalhost(env.ORIGIN) ? { crossSubDomainCookies: { enabled: true } } : {})
  },
  plugins: [
    twoFactor({ issuer: 'Scholio' }),
    sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
  ]
});
