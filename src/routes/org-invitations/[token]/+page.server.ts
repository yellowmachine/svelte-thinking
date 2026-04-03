import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { orgInvitation, organization } from '$lib/server/db/schemas/organizations.schema';
export const load = async ({ params, locals }: { params: { token: string }; locals: App.Locals }) => {
	const rows = await db
		.select({
			id: orgInvitation.id,
			status: orgInvitation.status,
			expiresAt: orgInvitation.expiresAt,
			orgId: orgInvitation.orgId,
			orgName: orgInvitation.orgName,
			invitedEmail: orgInvitation.invitedEmail,
			orgSlug: organization.slug
		})
		.from(orgInvitation)
		.leftJoin(organization, eq(organization.id, orgInvitation.orgId))
		.where(eq(orgInvitation.token, params.token))
		.limit(1);

	if (!rows[0]) error(404, 'Invitation not found');

	return {
		invitation: rows[0],
		token: params.token,
		user: locals.user ?? null
	};
};
