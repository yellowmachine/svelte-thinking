// Pure domain logic for invitations.
// No Svelte, no DB, no network — safe to import from both server and client.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProjectInvitationStatus = 'pending' | 'accepted' | 'expired' | 'cancelled';

export type OrgInvitationStatus = 'pending' | 'accepted' | 'rejected' | 'expired';

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

export function isInvitationPending(
	status: ProjectInvitationStatus | OrgInvitationStatus
): boolean {
	return status === 'pending';
}

export function isInvitationExpired(expiresAt: Date): boolean {
	return new Date(expiresAt) < new Date();
}

export function isInvitationAccepted(
	status: ProjectInvitationStatus | OrgInvitationStatus
): boolean {
	return status === 'accepted';
}
