import { describe, it, expect } from 'vitest';
import {
	getRequirementState,
	getProgressLabel,
	countRequirements,
	isValidTemplate,
	coerceTemplate,
	canManageRequirements,
	type Requirement
} from './requirements';

const req = (overrides: Partial<Requirement> = {}): Requirement => ({
	id: 'r1',
	name: 'Introduction',
	description: null,
	required: true,
	fulfilledDocumentId: null,
	...overrides
});

describe('getRequirementState', () => {
	it('returns empty when total is 0', () => {
		expect(getRequirementState({ total: 0, fulfilled: 0, requiredTotal: 0, requiredFulfilled: 0 })).toBe('empty');
	});

	it('returns complete when all are fulfilled', () => {
		expect(getRequirementState({ total: 3, fulfilled: 3, requiredTotal: 2, requiredFulfilled: 2 })).toBe('complete');
	});

	it('returns required-done when all required are fulfilled but not all optional', () => {
		expect(getRequirementState({ total: 3, fulfilled: 2, requiredTotal: 2, requiredFulfilled: 2 })).toBe('required-done');
	});

	it('returns pending otherwise', () => {
		expect(getRequirementState({ total: 3, fulfilled: 1, requiredTotal: 2, requiredFulfilled: 1 })).toBe('pending');
	});

	it('returns pending when requiredTotal is 0 but some unfulfilled', () => {
		expect(getRequirementState({ total: 2, fulfilled: 1, requiredTotal: 0, requiredFulfilled: 0 })).toBe('pending');
	});
});

describe('getProgressLabel', () => {
	it('returns null for empty state', () => {
		const counts = { total: 0, fulfilled: 0, requiredTotal: 0, requiredFulfilled: 0 };
		expect(getProgressLabel('empty', counts)).toBeNull();
	});

	it('returns total/total for complete state', () => {
		const counts = { total: 4, fulfilled: 4, requiredTotal: 3, requiredFulfilled: 3 };
		expect(getProgressLabel('complete', counts)).toBe('4/4');
	});

	it('returns requiredFulfilled/requiredTotal for pending and required-done', () => {
		const counts = { total: 4, fulfilled: 2, requiredTotal: 3, requiredFulfilled: 2 };
		expect(getProgressLabel('pending', counts)).toBe('2/3');
		expect(getProgressLabel('required-done', counts)).toBe('2/3');
	});
});

describe('countRequirements', () => {
	it('counts correctly with mixed requirements', () => {
		const reqs: Requirement[] = [
			req({ id: 'r1', required: true, fulfilledDocumentId: 'doc1' }),
			req({ id: 'r2', required: true, fulfilledDocumentId: null }),
			req({ id: 'r3', required: false, fulfilledDocumentId: 'doc2' }),
			req({ id: 'r4', required: false, fulfilledDocumentId: null })
		];
		expect(countRequirements(reqs)).toEqual({
			total: 4,
			fulfilled: 2,
			requiredTotal: 2,
			requiredFulfilled: 1
		});
	});

	it('returns zeros for empty list', () => {
		expect(countRequirements([])).toEqual({ total: 0, fulfilled: 0, requiredTotal: 0, requiredFulfilled: 0 });
	});
});

describe('isValidTemplate', () => {
	it('accepts valid templates', () => {
		expect(isValidTemplate('paper')).toBe(true);
		expect(isValidTemplate('thesis')).toBe(true);
		expect(isValidTemplate('generic')).toBe(true);
	});

	it('rejects invalid values', () => {
		expect(isValidTemplate('unknown')).toBe(false);
		expect(isValidTemplate(null)).toBe(false);
		expect(isValidTemplate(42)).toBe(false);
	});
});

describe('coerceTemplate', () => {
	it('returns the value when valid', () => {
		expect(coerceTemplate('paper')).toBe('paper');
	});

	it('falls back to generic for invalid values', () => {
		expect(coerceTemplate('garbage')).toBe('generic');
		expect(coerceTemplate(undefined)).toBe('generic');
	});
});

describe('canManageRequirements', () => {
	it('returns true when userId matches ownerId', () => {
		expect(canManageRequirements('user-1', 'user-1')).toBe(true);
	});

	it('returns false for different users', () => {
		expect(canManageRequirements('user-1', 'user-2')).toBe(false);
	});
});
