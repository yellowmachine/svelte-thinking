import { describe, it, expect } from 'vitest';
import {
	isProjectOwner,
	canInviteToProject,
	canRemoveCollaborator,
	canDelegateWriting,
	canEditDocument,
	isOrgOwner,
	canManageOrg
} from './permissions';

describe('isProjectOwner', () => {
	it('returns true when userId matches ownerId', () => {
		expect(isProjectOwner('u1', 'u1')).toBe(true);
	});

	it('returns false for different users', () => {
		expect(isProjectOwner('u1', 'u2')).toBe(false);
	});
});

describe('canInviteToProject', () => {
	it('allows the owner to invite', () => {
		expect(canInviteToProject('u1', 'u1')).toBe(true);
	});

	it('blocks non-owners', () => {
		expect(canInviteToProject('u2', 'u1')).toBe(false);
	});
});

describe('canRemoveCollaborator', () => {
	it('allows owner to remove another user', () => {
		expect(canRemoveCollaborator('owner', 'owner', 'collaborator')).toBe(true);
	});

	it('blocks owner from removing themselves', () => {
		expect(canRemoveCollaborator('owner', 'owner', 'owner')).toBe(false);
	});

	it('blocks non-owners from removing anyone', () => {
		expect(canRemoveCollaborator('other', 'owner', 'collaborator')).toBe(false);
	});
});

describe('canDelegateWriting', () => {
	it('allows the owner', () => {
		expect(canDelegateWriting('u1', 'u1')).toBe(true);
	});

	it('blocks non-owners', () => {
		expect(canDelegateWriting('u2', 'u1')).toBe(false);
	});
});

describe('canEditDocument', () => {
	it('allows owner regardless of role', () => {
		expect(canEditDocument(true, null)).toBe(true);
		expect(canEditDocument(true, 'reviewer')).toBe(true);
	});

	it('allows author and coauthor', () => {
		expect(canEditDocument(false, 'author')).toBe(true);
		expect(canEditDocument(false, 'coauthor')).toBe(true);
	});

	it('blocks reviewer and commenter', () => {
		expect(canEditDocument(false, 'reviewer')).toBe(false);
		expect(canEditDocument(false, 'commenter')).toBe(false);
	});

	it('blocks when not owner and no role', () => {
		expect(canEditDocument(false, null)).toBe(false);
	});
});

describe('isOrgOwner / canManageOrg', () => {
	it('allows the owner', () => {
		expect(isOrgOwner('u1', 'u1')).toBe(true);
		expect(canManageOrg('u1', 'u1')).toBe(true);
	});

	it('blocks non-owners', () => {
		expect(isOrgOwner('u2', 'u1')).toBe(false);
		expect(canManageOrg('u2', 'u1')).toBe(false);
	});
});
