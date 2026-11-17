/**
 * Deletes everything Scholio keeps about a user.
 *
 * It must run inside `withRLS` for that user: every scholio table has row-level
 * security, and with no `app.current_user_id` the app role sees (and deletes)
 * nothing. Rows that belong to other projects through a foreign key go with
 * ON DELETE CASCADE, which Postgres runs without RLS.
 *
 * Kept on purpose:
 * - ai_usage_log: what each AI call cost. The table has no delete policy.
 * - comments and issue comments written in other people's projects: they are
 *   part of those projects' discussion.
 */
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import type { Db } from '$lib/server/db';
import { project, projectCollaborator } from '$lib/server/db/schemas/projects.schema';
import {
	userProfile,
	userApiKey,
	userJupyterConnection,
	notificationPreference,
	userS3Config,
	userSpellAllowlist
} from '$lib/server/db/schemas/users.schema';
import { projectPhoto } from '$lib/server/db/schemas/photos.schema';
import { reference, projectReference } from '$lib/server/db/schemas/references.schema';
import { tag } from '$lib/server/db/schemas/tags.schema';
import { aiConversation } from '$lib/server/db/schemas/ai.schema';
import { blogPost, blogAggregator } from '$lib/server/db/schemas/blog.schema';
import { organization, organizationMember } from '$lib/server/db/schemas/organizations.schema';
import { projectInterest } from '$lib/server/db/schemas/discover.schema';

/**
 * A file to remove from storage once the account is gone. `orgId` says which
 * bucket it lives in, as resolveProjectS3Config would pick it: the
 * organization's when its project belongs to one, the user's own otherwise.
 */
export type AccountFile = { key: string; orgId: string | null };

export type AccountDeletionResult = {
	deletedProjects: number;
	/** Organizations the user owned; their projects owned by others are now personal. */
	deletedOrgIds: string[];
};

/**
 * Files in the user's own projects and library. Call it inside the same RLS
 * transaction as deleteAccountData, before it: afterwards the rows are gone.
 */
export async function collectAccountFiles(tx: Db, userId: string): Promise<AccountFile[]> {
	const photos = await tx
		.select({ key: projectPhoto.key, orgId: project.orgId })
		.from(projectPhoto)
		.innerJoin(project, eq(project.id, projectPhoto.projectId))
		.where(eq(project.ownerId, userId));

	// A reference PDF is uploaded through a project, to that project's bucket,
	// under projects/<projectId>/. The reference may be linked to several.
	const refRows = await tx
		.select({
			refId: reference.id,
			key: reference.pdfKey,
			projectId: project.id,
			orgId: project.orgId
		})
		.from(reference)
		.leftJoin(projectReference, eq(projectReference.referenceId, reference.id))
		.leftJoin(project, eq(project.id, projectReference.projectId))
		.where(and(eq(reference.userId, userId), isNotNull(reference.pdfKey)));

	const refPdfs = new Map<string, AccountFile>();
	for (const r of refRows) {
		if (!r.key) continue;
		const uploadedHere = r.projectId !== null && r.key.startsWith(`projects/${r.projectId}/`);
		if (!refPdfs.has(r.refId) || uploadedHere) {
			refPdfs.set(r.refId, { key: r.key, orgId: r.orgId ?? null });
		}
	}

	return [...photos, ...refPdfs.values()];
}

export async function deleteAccountData(tx: Db, userId: string): Promise<AccountDeletionResult> {
	const ownedProjects = await tx
		.select({ id: project.id })
		.from(project)
		.where(eq(project.ownerId, userId));
	const projectIds = ownedProjects.map((p) => p.id);

	// Owned projects: documents, versions, comments, collaborators, photos…
	// go with them by cascade.
	const deleted =
		projectIds.length > 0
			? await tx
					.delete(project)
					.where(inArray(project.id, projectIds))
					.returning({ id: project.id })
			: [];
	if (deleted.length !== projectIds.length) {
		throw new Error(
			`Account deletion: only ${deleted.length} of ${projectIds.length} projects could be deleted`
		);
	}

	// Owned organizations: members, API keys, invitations and storage config cascade.
	// Projects other members own in them stay, as personal projects (org_id SET NULL).
	const deletedOrgs = await tx
		.delete(organization)
		.where(eq(organization.ownerId, userId))
		.returning({ id: organization.id });

	// Memberships in other people's projects and organizations.
	await tx.delete(projectCollaborator).where(eq(projectCollaborator.userId, userId));
	await tx.delete(organizationMember).where(eq(organizationMember.userId, userId));
	await tx.delete(projectInterest).where(eq(projectInterest.userId, userId));

	// The user's library (links to other projects cascade) and personal data.
	await tx.delete(reference).where(eq(reference.userId, userId));
	await tx.delete(tag).where(eq(tag.userId, userId));
	await tx.delete(aiConversation).where(eq(aiConversation.userId, userId));
	await tx.delete(blogPost).where(eq(blogPost.userId, userId));
	await tx.delete(blogAggregator).where(eq(blogAggregator.userId, userId));
	await tx.delete(notificationPreference).where(eq(notificationPreference.userId, userId));
	await tx.delete(userJupyterConnection).where(eq(userJupyterConnection.userId, userId));
	await tx.delete(userSpellAllowlist).where(eq(userSpellAllowlist.userId, userId));
	await tx.delete(userS3Config).where(eq(userS3Config.userId, userId));
	await tx.delete(userApiKey).where(eq(userApiKey.userId, userId));
	await tx.delete(userProfile).where(eq(userProfile.userId, userId));

	return { deletedProjects: deleted.length, deletedOrgIds: deletedOrgs.map((o) => o.id) };
}
