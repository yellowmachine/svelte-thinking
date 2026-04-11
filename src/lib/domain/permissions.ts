// Pure permission rules for Scholio.
// No Svelte, no DB, no network — safe to import from both server and client.
//
// All functions are intentionally simple today (owner === user).
// Centralising them here means future role/org changes happen in one place.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CollaboratorRole = 'author' | 'coauthor' | 'reviewer' | 'commenter';

// ---------------------------------------------------------------------------
// Project permissions
// ---------------------------------------------------------------------------

export function isProjectOwner(userId: string, ownerId: string): boolean {
	return userId === ownerId;
}

export function canInviteToProject(userId: string, ownerId: string): boolean {
	return isProjectOwner(userId, ownerId);
}

/** An owner cannot invite themselves — they are already the project owner. */
export function isSelfInvite(inviterId: string, inviteeId: string): boolean {
	return inviterId === inviteeId;
}

/** Requester must be owner, and the target must not be the owner themselves. */
export function canRemoveCollaborator(
	requesterId: string,
	ownerId: string,
	targetUserId: string
): boolean {
	return isProjectOwner(requesterId, ownerId) && targetUserId !== ownerId;
}

/** Returns true if a collaborator role grants write access to documents. */
export function roleAllowsWrite(role: CollaboratorRole | null): boolean {
	return role === 'author' || role === 'coauthor';
}

/**
 * Project owner can always delegate or reclaim.
 * The current delegated writer (writerUserId) can also release or transfer their slot,
 * even if their collaborator role no longer allows writing (downgrade case).
 */
export function canDelegateWriting(ctx: {
	userId: string;
	ownerId: string;
	writerUserId: string | null;
}): boolean {
	return isProjectOwner(ctx.userId, ctx.ownerId) || ctx.userId === ctx.writerUserId;
}

/** Only the project owner can change a collaborator's role. The owner's own role is fixed. */
export function canChangeCollaboratorRole(
	requesterId: string,
	ownerId: string,
	targetUserId: string
): boolean {
	return isProjectOwner(requesterId, ownerId) && targetUserId !== ownerId;
}

// ---------------------------------------------------------------------------
// Document permissions
// ---------------------------------------------------------------------------

/** Owners, authors and coauthors can edit. Reviewers and commenters cannot. */
export function canEditDocument(isOwner: boolean, role: CollaboratorRole | null): boolean {
	return isOwner || role === 'author' || role === 'coauthor';
}

/**
 * Unified document write check that respects both delegation and collaborator role.
 *
 * - No delegation (writerUserId null): only project owner writes.
 * - Delegation set: only the delegated user writes, AND their role must allow it.
 *   This means a downgraded writer (e.g. reviewer) is blocked even if still set as writerUserId.
 */
export function canWriteDocument(ctx: {
	isProjectOwner: boolean;
	writerUserId: string | null;
	currentUserId: string;
	collaboratorRole: CollaboratorRole | null;
}): boolean {
	const { isProjectOwner: isProjOwner, writerUserId, currentUserId, collaboratorRole } = ctx;
	if (writerUserId === null) {
		return isProjOwner;
	}
	if (currentUserId === writerUserId) {
		return roleAllowsWrite(collaboratorRole);
	}
	return false;
}

// ---------------------------------------------------------------------------
// Organisation permissions
// ---------------------------------------------------------------------------

export function isOrgOwner(userId: string, ownerId: string): boolean {
	return userId === ownerId;
}

export function canManageOrg(userId: string, ownerId: string): boolean {
	return isOrgOwner(userId, ownerId);
}
