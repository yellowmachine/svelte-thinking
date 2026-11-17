/**
 * Irreversible actions (deleting the account) ask for a session started a
 * moment ago, so a stolen or forgotten session isn't enough. Signing in again
 * goes through the password or Seilide, and through 2FA when it is on.
 */
export const FRESH_SESSION_MAX_AGE_MS = 10 * 60 * 1000;

/** The code an endpoint answers with when the session isn't fresh enough. */
export const REAUTH_REQUIRED = 'reauth_required';

export function isSessionFresh(
	session: { createdAt: Date | string } | null | undefined,
	now: Date = new Date()
): boolean {
	if (!session) return false;
	const age = now.getTime() - new Date(session.createdAt).getTime();
	return age >= 0 && age <= FRESH_SESSION_MAX_AGE_MS;
}
