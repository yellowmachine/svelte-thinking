import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user!;

	const [profile] = await db
		.select({ orcid: userProfile.orcid, orcidVerified: userProfile.orcidVerified })
		.from(userProfile)
		.where(eq(userProfile.userId, user.id))
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
		orcidStatus: orcidStatus === 'connected' ? 'connected' : orcidStatus === 'error' ? 'error' : null
	};
};
