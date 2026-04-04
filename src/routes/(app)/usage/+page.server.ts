import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { organization } from '$lib/server/db/schemas/organizations.schema';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) redirect(302, '/login');

	// Pass orgs the user owns so the dashboard can link to them
	const ownedOrgs = await event.locals.withRLS((db) =>
		db
			.select({ id: organization.id, name: organization.name })
			.from(organization)
			.where(eq(organization.ownerId, event.locals.user!.id))
	);

	return { ownedOrgs };
};
