import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { account } from '$lib/server/db/auth.schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '$lib/server/auth';
import { env } from '$env/dynamic/private';

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user!;

	const [profile] = await db
		.select({ orcid: userProfile.orcid, orcidVerified: userProfile.orcidVerified })
		.from(userProfile)
		.where(eq(userProfile.userId, user.id))
		.limit(1);

	const [githubAccount] = await db
		.select({ id: account.id })
		.from(account)
		.where(and(eq(account.userId, user.id), eq(account.providerId, 'github')))
		.limit(1);

	const orcidStatus = event.url.searchParams.get('orcid');

	return {
		user: {
			id: user.id,
			name: user.name,
			email: user.email,
			twoFactorEnabled: (user as Record<string, unknown>).twoFactorEnabled === true
		},
		orcid: profile?.orcid ?? null,
		orcidVerified: profile?.orcidVerified ?? false,
		orcidStatus: orcidStatus === 'connected' ? 'connected' : orcidStatus === 'error' ? 'error' : null,
		githubLinked: !!githubAccount,
		isAdmin: !!env.ADMIN_EMAIL && user.email === env.ADMIN_EMAIL
	};
};

export const actions: Actions = {
	linkGitHub: async (event) => {
		if (!event.locals.user) return fail(401, { message: 'Not authenticated' });

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const result = await (auth.api as any).linkSocialAccount({
			body: { provider: 'github', callbackURL: '/settings' },
			headers: event.request.headers
		});

		if (result?.url) redirect(302, result.url);
		return fail(400, { message: 'Error initiating GitHub connection' });
	},

	unlinkGitHub: async (event) => {
		if (!event.locals.user) return fail(401, { message: 'Not authenticated' });

		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await (auth.api as any).unlinkAccount({
				body: { providerId: 'github' },
				headers: event.request.headers
			});
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : 'Error unlinking GitHub account';
			return fail(400, { message: msg });
		}

		return { success: true };
	}
};
