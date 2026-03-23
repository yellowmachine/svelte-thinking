import { redirect } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { projectInvitation } from '$lib/server/db/schemas/invitations.schema';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	if (!event.locals.user) {
		const redirectParam = event.url.pathname !== '/' ? `?redirect=${event.url.pathname}` : '';
		redirect(302, `/login${redirectParam}`);
	}

	if (!event.locals.hasScholioProfile) {
		redirect(302, '/no-access');
	}

	const pending = await db
		.select({ id: projectInvitation.id })
		.from(projectInvitation)
		.where(
			and(
				eq(projectInvitation.invitedEmail, event.locals.user.email),
				eq(projectInvitation.status, 'pending')
			)
		);

	return {
		user: {
			id: event.locals.user.id,
			name: event.locals.user.name,
			email: event.locals.user.email
		},
		pendingInvitationCount: pending.length
	};
};
