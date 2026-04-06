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

/** Requester must be owner, and the target must not be the owner themselves. */
export function canRemoveCollaborator(
	requesterId: string,
	ownerId: string,
	targetUserId: string
): boolean {
	return isProjectOwner(requesterId, ownerId) && targetUserId !== ownerId;
}

export function canDelegateWriting(userId: string, ownerId: string): boolean {
	return isProjectOwner(userId, ownerId);
}

// ---------------------------------------------------------------------------
// Document permissions
// ---------------------------------------------------------------------------

/** Owners, authors and coauthors can edit. Reviewers and commenters cannot. */
export function canEditDocument(isOwner: boolean, role: CollaboratorRole | null): boolean {
	return isOwner || role === 'author' || role === 'coauthor';
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
