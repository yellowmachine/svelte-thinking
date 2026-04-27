// Pure domain logic for project requirements.
// No Svelte, no DB, no network — safe to import from both server and client.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TemplateType = 'generic' | 'paper' | 'thesis' | 'medical' | 'report' | 'book';

export type RequirementState = 'empty' | 'pending' | 'required-done' | 'complete';

export interface Requirement {
	id: string;
	name: string;
	description: string | null;
	required: boolean;
	fulfilledDocumentId: string | null;
}

// ---------------------------------------------------------------------------
// Template validation
// ---------------------------------------------------------------------------

export const VALID_TEMPLATES: TemplateType[] = [
	'generic',
	'paper',
	'thesis',
	'medical',
	'report',
	'book'
];

export function isValidTemplate(value: unknown): value is TemplateType {
	return VALID_TEMPLATES.includes(value as TemplateType);
}

export function coerceTemplate(value: unknown): TemplateType {
	return isValidTemplate(value) ? value : 'generic';
}

// ---------------------------------------------------------------------------
// Progress state
// ---------------------------------------------------------------------------

export interface RequirementCounts {
	fulfilled: number;
	total: number;
	requiredFulfilled: number;
	requiredTotal: number;
}

export function getRequirementState(counts: RequirementCounts): RequirementState {
	const { fulfilled, total, requiredFulfilled, requiredTotal } = counts;
	if (total === 0) return 'empty';
	if (fulfilled === total) return 'complete';
	if (requiredFulfilled === requiredTotal && requiredTotal > 0) return 'required-done';
	return 'pending';
}

export function getProgressLabel(
	state: RequirementState,
	counts: RequirementCounts
): string | null {
	if (state === 'empty') return null;
	if (state === 'complete') return `${counts.total}/${counts.total}`;
	return `${counts.requiredFulfilled}/${counts.requiredTotal}`;
}

export function countRequirements(requirements: Requirement[]): RequirementCounts {
	const total = requirements.length;
	const fulfilled = requirements.filter((r) => r.fulfilledDocumentId !== null).length;
	const requiredTotal = requirements.filter((r) => r.required).length;
	const requiredFulfilled = requirements.filter(
		(r) => r.required && r.fulfilledDocumentId !== null
	).length;
	return { total, fulfilled, requiredTotal, requiredFulfilled };
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export function canManageRequirements(userId: string, ownerId: string): boolean {
	return userId === ownerId;
}
