import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { organization } from '$lib/server/db/schemas/organizations.schema';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) redirect(302, '/login');

	const [org] = await event.locals.withRLS((db) =>
		db
			.select({ id: organization.id, name: organization.name, ownerId: organization.ownerId })
			.from(organization)
			.where(eq(organization.id, event.params.id))
			.limit(1)
	);

	if (!org) error(404, 'Organization not found');
	if (org.ownerId !== event.locals.user.id) error(403, 'Only the owner can view usage');

	return { org };
};
