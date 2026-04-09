const PG = {
	UNIQUE_VIOLATION: '23505',
	FOREIGN_KEY_VIOLATION: '23503',
	RLS_VIOLATION: '42501'
} as const;

function isPgError(err: unknown): err is { code: string; constraint?: string } {
	return (
		typeof err === 'object' &&
		err !== null &&
		'code' in err &&
		typeof (err as { code: unknown }).code === 'string'
	);
}

export function isUniqueViolation(err: unknown, constraint?: string): boolean {
	if (!isPgError(err) || err.code !== PG.UNIQUE_VIOLATION) return false;
	return constraint ? err.constraint === constraint : true;
}

export function isForeignKeyViolation(err: unknown): boolean {
	return isPgError(err) && err.code === PG.FOREIGN_KEY_VIOLATION;
}

export function isRlsViolation(err: unknown): boolean {
	return isPgError(err) && err.code === PG.RLS_VIOLATION;
}

export function constraintName(err: unknown): string | undefined {
	return isPgError(err) ? err.constraint : undefined;
}
