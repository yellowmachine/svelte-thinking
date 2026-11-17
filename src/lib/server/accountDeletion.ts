/**
 * Deletes everything Scholio keeps about a user.
 *
 * It must run inside `withRLS` for that user: every scholio table has row-level
 * security, and with no `app.current_user_id` the app role sees (and deletes)
 * nothing. Rows that belong to other projects through a foreign key go with
 * ON DELETE CASCADE, which Postgres runs without RLS.
 *
 * What happens to each column that holds a user id, in every table, is in
 * USER_ID_COLUMNS below; accountDeletion.test.ts fails when a table gains such a
 * column that isn't listed there. The waitlist entry (by email) is kept: with
 * it the same email can sign up again.
 */
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import type { Db } from '$lib/server/db';
import { handOverOrgProjects, releaseWrittenDocuments } from '$lib/server/definerFunctions';
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
import { document } from '$lib/server/db/schemas/documents.schema';
import { issue } from '$lib/server/db/schemas/issues.schema';
import { notificationDismissal } from '$lib/server/db/schemas/notifications.schema';
import { feedback } from '$lib/server/db/schemas/feedback.schema';

/**
 * Every column that holds a user id, and what account deletion does with it:
 * - `deleted`: the user's rows go.
 * - `cascade`: they go with a parent row this deletion removes.
 * - `kept`: they stay, for the reason given; names show as "Deleted user"
 *   (userNameSql).
 * accountDeletion.test.ts compares it with the schema, so a new column that
 * points at users can't be forgotten here.
 */
export const USER_ID_COLUMNS: Record<string, string> = {
	// Better Auth
	'public.session.user_id': 'cascade: user (Better Auth FK)',
	'public.account.user_id': 'cascade: user (Better Auth FK)',
	'public.two_factor.user_id': 'cascade: user (Better Auth FK)',

	// The user's own data
	'scholio.user_profile.user_id': 'deleted',
	'scholio.user_api_key.user_id': 'deleted',
	'scholio.user_jupyter_connection.user_id': 'deleted',
	'scholio.notification_preference.user_id': 'deleted',
	'scholio.user_s3_config.user_id': 'deleted',
	'scholio.user_spell_allowlist.user_id': 'deleted',
	'scholio.ai_conversation.user_id': 'deleted',
	'scholio.reference.user_id': 'deleted',
	'scholio.tag.user_id': 'deleted',
	'scholio.project_interest.user_id': 'deleted',
	'scholio.notification_dismissal.user_id': 'deleted',
	'scholio.blog_post.user_id': 'deleted',
	'scholio.blog_aggregator.user_id': 'deleted',

	// Projects and organizations
	'scholio.project.owner_id':
		"deleted; those in someone else's organization are handed over to its owner",
	'scholio.project_collaborator.user_id': 'deleted',
	'scholio.project_collaborator.owner_user_id':
		'cascade: owned projects; moved to the new owner on hand-over',
	'scholio.project_invitation.invited_by':
		'cascade: only project owners invite, so they go with the owned projects',
	'scholio.organization.owner_id': 'deleted; projects others own in it become personal',
	'scholio.organization_member.user_id': 'deleted',
	'scholio.organization_member.org_owner_id': 'cascade: owned organizations',
	'scholio.org_invitation.invited_by':
		'cascade: only organization owners invite, so they go with the owned organizations',

	// What the user leaves in other people's projects
	'scholio.document.owner_user_id':
		'deleted for private documents; kept for shared ones: who created them',
	'scholio.document.writer_user_id': 'cleared: write access goes back to the project owner',
	'scholio.issue.owner_user_id':
		'deleted for private issues; kept for shared ones: who opened them',
	'scholio.comment.author_id': "kept: part of the project's discussion",
	'scholio.issue_comment.author_id': "kept: part of the project's discussion",
	'scholio.document_version.created_by': "kept: part of the document's history",
	'scholio.document_version_share.created_by':
		"kept: the link shares a version of the project's document",
	'scholio.project_photo.uploaded_by': 'kept: belongs to the project (cascade in owned ones)',
	'scholio.project_dataset.uploaded_by': 'kept: belongs to the project (cascade in owned ones)',
	'scholio.project_notebook.imported_by': 'kept: belongs to the project (cascade in owned ones)',
	'scholio.blog_post_comment.author_id': "kept: part of the post's discussion",
	'scholio.blog_aggregator_item.target_user_id':
		"kept: lists join the target's profile, so a deleted blog drops out of them",

	// Elsewhere
	'scholio.feedback.user_id': 'kept: public by design; a signed entry loses the name',
	'scholio.ai_usage_log.user_id': 'kept: what each AI call cost; the table has no delete policy',
	'scholio.notification.created_by': 'kept: broadcasts written by an admin'
};

/**
 * A file to remove from storage once the account is gone. `orgId` says which
 * bucket it lives in, as resolveProjectS3Config would pick it: the
 * organization's when its project belongs to one, the user's own otherwise.
 */
export type AccountFile = { key: string; orgId: string | null };

export type AccountDeletionResult = {
	/** Files to remove from storage, now that their rows are gone. */
	files: AccountFile[];
	deletedProjects: number;
	/** Projects in someone else's organization, now owned by that organization's owner. */
	handedOverProjectIds: string[];
	/** Organizations the user owned; their projects owned by others are now personal. */
	deletedOrgIds: string[];
};

/**
 * Photos of the user's own projects and PDFs of their library. Run it before
 * the hand-over: afterwards the user no longer sees the projects handed over,
 * and a PDF uploaded through one of them would land in the wrong bucket.
 */
async function collectAccountFiles(
	tx: Db,
	userId: string
): Promise<{ photos: (AccountFile & { projectId: string })[]; pdfs: AccountFile[] }> {
	const photos = await tx
		.select({ key: projectPhoto.key, orgId: project.orgId, projectId: project.id })
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

	return { photos, pdfs: [...refPdfs.values()] };
}

/**
 * `beforeDelete` gets the files once they are known and before anything is
 * deleted: the moment to read the credentials of their buckets, which go with
 * the user's S3 config, the organizations they own and their memberships.
 */
export async function deleteAccountData(
	tx: Db,
	userId: string,
	beforeDelete?: (files: AccountFile[]) => Promise<void>
): Promise<AccountDeletionResult> {
	const { photos, pdfs } = await collectAccountFiles(tx, userId);

	const handedOverProjectIds = await handOverOrgProjects(tx);

	// The photos of a project handed over stay with it, in the org's bucket.
	const files = [
		...photos
			.filter((p) => !handedOverProjectIds.includes(p.projectId))
			.map(({ key, orgId }) => ({ key, orgId })),
		...pdfs
	];
	await beforeDelete?.(files);

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

	// What the user leaves in other people's projects: write access goes back
	// to the owner; private documents and issues, which only they could see, go.
	await releaseWrittenDocuments(tx);
	await tx
		.delete(document)
		.where(and(eq(document.isPrivate, true), eq(document.ownerUserId, userId)));
	await tx.delete(issue).where(and(eq(issue.isPrivate, true), eq(issue.ownerUserId, userId)));

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
	await tx.delete(notificationDismissal).where(eq(notificationDismissal.userId, userId));
	// Feedback stays; a signed entry loses the name, and shows as "Deleted user".
	await tx.update(feedback).set({ userName: null }).where(eq(feedback.userId, userId));

	return {
		files,
		deletedProjects: deleted.length,
		handedOverProjectIds,
		deletedOrgIds: deletedOrgs.map((o) => o.id)
	};
}
