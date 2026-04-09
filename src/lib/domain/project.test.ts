import { describe, it, expect } from 'vitest';
import {
	PROJECT_STATUSES,
	PROJECT_STATUS_LABELS,
	PROJECT_ROLE_LABELS,
	INVITABLE_ROLES
} from './project';

describe('PROJECT_STATUSES', () => {
	it('contains all expected statuses', () => {
		expect(PROJECT_STATUSES).toContain('draft');
		expect(PROJECT_STATUSES).toContain('active');
		expect(PROJECT_STATUSES).toContain('review');
		expect(PROJECT_STATUSES).toContain('published');
		expect(PROJECT_STATUSES).toContain('archived');
	});
});

describe('PROJECT_STATUS_LABELS', () => {
	it('has a label for every status', () => {
		for (const status of PROJECT_STATUSES) {
			expect(PROJECT_STATUS_LABELS[status]).toBeTruthy();
		}
	});
});

describe('PROJECT_ROLE_LABELS', () => {
	it('has labels for all roles including owner', () => {
		expect(PROJECT_ROLE_LABELS['owner']).toBe('Owner');
		expect(PROJECT_ROLE_LABELS['author']).toBe('Author');
		expect(PROJECT_ROLE_LABELS['coauthor']).toBe('Co-author');
		expect(PROJECT_ROLE_LABELS['reviewer']).toBe('Reviewer');
		expect(PROJECT_ROLE_LABELS['commenter']).toBe('Commenter');
	});
});

describe('INVITABLE_ROLES', () => {
	it('does not include owner', () => {
		expect(INVITABLE_ROLES).not.toContain('owner');
	});

	it('includes all collaborator roles', () => {
		expect(INVITABLE_ROLES).toContain('author');
		expect(INVITABLE_ROLES).toContain('coauthor');
		expect(INVITABLE_ROLES).toContain('reviewer');
		expect(INVITABLE_ROLES).toContain('commenter');
	});
});
