import { redirect } from '@sveltejs/kit';
import { eq, and, gt, lt, not, exists } from 'drizzle-orm';
import { projectInvitation } from '$lib/server/db/schemas/invitations.schema';
import { userProfile, userApiKey, userS3Config } from '$lib/server/db/schemas/users.schema';
import { organization, organizationMember } from '$lib/server/db/schemas/organizations.schema';
import { notification, notificationDismissal } from '$lib/server/db/schemas/notifications.schema';
import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';
import { parseTaskConfig } from '$lib/ai-config';
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
  const now = new Date();

  const [activeNotifications, [pending, profile, ownedOrgs, memberOrgs, aiKeys, userS3ConfigKey]] = await Promise.all([
    db
      .select({ id: notification.id, message: notification.message, expiresAt: notification.expiresAt })
      .from(notification)
      .where(
        and(
          lt(notification.startsAt, now),
          gt(notification.expiresAt, now),
          not(
            exists(
              db
                .select({ one: notificationDismissal.notificationId })
                .from(notificationDismissal)
                .where(
                  and(
                    eq(notificationDismissal.notificationId, notification.id),
                    eq(notificationDismissal.userId, userId)
                  )
                )
            )
          )
        )
      )
      .orderBy(notification.startsAt),
    event.locals.withRLS((tx) =>
    Promise.all([
      tx
        .select({ id: projectInvitation.id })
        .from(projectInvitation)
        .where(
          and(
            eq(projectInvitation.invitedEmail, event.locals.user!.email),
            eq(projectInvitation.status, 'pending')
          )
        ),
      tx
        .select({ theme: userProfile.theme, aiTaskConfig: userProfile.aiTaskConfig, useInternalStorage: userProfile.useInternalStorage })
        .from(userProfile)
        .where(eq(userProfile.userId, userId))
        .limit(1),
      tx
        .select({ id: organization.id, name: organization.name, slug: organization.slug, role: sql<string>`'owner'` })
        .from(organization)
        .where(eq(organization.ownerId, userId)),
      tx
        .select({ id: organization.id, name: organization.name, slug: organization.slug, role: organizationMember.role })
        .from(organizationMember)
        .innerJoin(organization, eq(organization.id, organizationMember.orgId))
        .where(eq(organizationMember.userId, userId)),
      tx
        .select({ id: userApiKey.id, enabled: userApiKey.enabled })
        .from(userApiKey)
        .where(eq(userApiKey.userId, userId)),
      tx
        .select({ id: userS3Config.id, verified: userS3Config.verified })
        .from(userS3Config)
        .where(eq(userS3Config.userId, userId))
    ])
  )]);

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
    orgs,
    aiTaskConfig: parseTaskConfig(profile[0]?.aiTaskConfig ?? null),
    hasAiKey: aiKeys.some((k) => k.enabled),
    hasUserS3Config: userS3ConfigKey[0] !== undefined || profile[0]?.useInternalStorage === true,
    activeNotifications
  };
};
