/**
 * The `?redirect=` of the login and logout routes, if it is a path in this app.
 * Anything else (an absolute URL, `//host`, `/\host`, which browsers read as
 * another origin) gives `fallback`, so the parameter can't send people away.
 */
export function safeRedirectPath(value: string | null | undefined, fallback: string): string {
	if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
		return fallback;
	}
	return value;
}
