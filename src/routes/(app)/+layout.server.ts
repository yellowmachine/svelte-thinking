import { redirect } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { projectInvitation } from '$lib/server/db/schemas/invitations.schema';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { organization, organizationMember } from '$lib/server/db/schemas/organizations.schema';
import { sql } from 'drizzle-orm';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	if (!event.locals.user) {
		const redirectParam = event.url.pathname !== '/' ? `?redirect=${event.url.pathname}` : '';
		redirect(302, `/login${redirectParam}`);
	}

	if (!event.locals.hasScholioProfile) {
		redirect(302, '/no-access');
	}

	const userId = event.locals.user.id;

	const [pending, profile, ownedOrgs, memberOrgs] = await Promise.all([
		db
			.select({ id: projectInvitation.id })
			.from(projectInvitation)
			.where(
				and(
					eq(projectInvitation.invitedEmail, event.locals.user.email),
					eq(projectInvitation.status, 'pending')
				)
			),
		db
			.select({ theme: userProfile.theme })
			.from(userProfile)
			.where(eq(userProfile.userId, userId))
			.limit(1),
		db
			.select({ id: organization.id, name: organization.name, slug: organization.slug, role: sql<string>`'owner'` })
			.from(organization)
			.where(eq(organization.ownerId, userId)),
		db
			.select({ id: organization.id, name: organization.name, slug: organization.slug, role: organizationMember.role })
			.from(organizationMember)
			.innerJoin(organization, eq(organization.id, organizationMember.orgId))
			.where(eq(organizationMember.userId, userId))
	]);

	// Deduplicate
	const seen = new Set(ownedOrgs.map((o) => o.id));
	const orgs = [...ownedOrgs, ...memberOrgs.filter((m) => !seen.has(m.id))];

	return {
		user: {
			id: userId,
			name: event.locals.user.name,
			email: event.locals.user.email
		},
		pendingInvitationCount: pending.length,
		theme: (profile[0]?.theme ?? 'warm') as string,
		orgs
	};
};
