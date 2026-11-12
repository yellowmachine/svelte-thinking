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
import { eq, inArray } from 'drizzle-orm';
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
import { reference } from '$lib/server/db/schemas/references.schema';
import { tag } from '$lib/server/db/schemas/tags.schema';
import { aiConversation, userAiUsage } from '$lib/server/db/schemas/ai.schema';
import { blogPost, blogAggregator } from '$lib/server/db/schemas/blog.schema';
import { organization, organizationMember } from '$lib/server/db/schemas/organizations.schema';
import { projectInterest } from '$lib/server/db/schemas/discover.schema';

export type AccountDeletionResult = {
	/** Storage keys of the files that lived in the user's own projects and library. */
	storageKeys: string[];
	deletedProjects: number;
};

export async function deleteAccountData(tx: Db, userId: string): Promise<AccountDeletionResult> {
	const ownedProjects = await tx
		.select({ id: project.id })
		.from(project)
		.where(eq(project.ownerId, userId));
	const projectIds = ownedProjects.map((p) => p.id);

	const photos =
		projectIds.length > 0
			? await tx
					.select({ key: projectPhoto.key })
					.from(projectPhoto)
					.where(inArray(projectPhoto.projectId, projectIds))
			: [];
	const refPdfs = await tx
		.select({ key: reference.pdfKey })
		.from(reference)
		.where(eq(reference.userId, userId));

	const storageKeys = [
		...photos.map((p) => p.key),
		...refPdfs.flatMap((r) => (r.key ? [r.key] : []))
	];

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
	await tx.delete(organization).where(eq(organization.ownerId, userId));

	// Memberships in other people's projects and organizations.
	await tx.delete(projectCollaborator).where(eq(projectCollaborator.userId, userId));
	await tx.delete(organizationMember).where(eq(organizationMember.userId, userId));
	await tx.delete(projectInterest).where(eq(projectInterest.userId, userId));

	// The user's library (links to other projects cascade) and personal data.
	await tx.delete(reference).where(eq(reference.userId, userId));
	await tx.delete(tag).where(eq(tag.userId, userId));
	await tx.delete(aiConversation).where(eq(aiConversation.userId, userId));
	await tx.delete(userAiUsage).where(eq(userAiUsage.userId, userId));
	await tx.delete(blogPost).where(eq(blogPost.userId, userId));
	await tx.delete(blogAggregator).where(eq(blogAggregator.userId, userId));
	await tx.delete(notificationPreference).where(eq(notificationPreference.userId, userId));
	await tx.delete(userJupyterConnection).where(eq(userJupyterConnection.userId, userId));
	await tx.delete(userSpellAllowlist).where(eq(userSpellAllowlist.userId, userId));
	await tx.delete(userS3Config).where(eq(userS3Config.userId, userId));
	await tx.delete(userApiKey).where(eq(userApiKey.userId, userId));
	await tx.delete(userProfile).where(eq(userProfile.userId, userId));

	return { storageKeys, deletedProjects: deleted.length };
}
