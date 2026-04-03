import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { env } from '$env/dynamic/private';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
import { sendVerificationEmail } from '$lib/server/resend';

export const auth = betterAuth({
	baseURL: env.ORIGIN,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'pg' }),
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: true,
		sendVerificationEmail: async ({ user, url }: { user: { email: string }; url: string }) => {
			await sendVerificationEmail(user.email, url);
		}
	},
	socialProviders: {
		github: {
			clientId: env.GITHUB_CLIENT_ID,
			clientSecret: env.GITHUB_CLIENT_SECRET
		}
	},
	plugins: [
		twoFactor({ issuer: 'Scholio' }),
		sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
	]
});
