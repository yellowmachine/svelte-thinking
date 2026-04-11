import { describe, it, expect } from 'vitest';
import {
	isProjectOwner,
	canInviteToProject,
	canRemoveCollaborator,
	canDelegateWriting,
	canChangeCollaboratorRole,
	canEditDocument,
	canWriteDocument,
	roleAllowsWrite,
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
	it('allows the project owner (no delegation)', () => {
		expect(canDelegateWriting({ userId: 'owner', ownerId: 'owner', writerUserId: null })).toBe(true);
	});

	it('allows the project owner when writer is set', () => {
		expect(canDelegateWriting({ userId: 'owner', ownerId: 'owner', writerUserId: 'writer' })).toBe(true);
	});

	it('allows the current writer to release their slot', () => {
		expect(canDelegateWriting({ userId: 'writer', ownerId: 'owner', writerUserId: 'writer' })).toBe(true);
	});

	it('blocks a non-owner with no writer slot', () => {
		expect(canDelegateWriting({ userId: 'other', ownerId: 'owner', writerUserId: null })).toBe(false);
	});

	it('blocks a non-owner who is not the current writer', () => {
		expect(canDelegateWriting({ userId: 'other', ownerId: 'owner', writerUserId: 'writer' })).toBe(false);
	});
});

describe('canChangeCollaboratorRole', () => {
	it('allows the owner to change a collaborator role', () => {
		expect(canChangeCollaboratorRole('owner', 'owner', 'collab')).toBe(true);
	});

	it('blocks the owner from changing their own role', () => {
		expect(canChangeCollaboratorRole('owner', 'owner', 'owner')).toBe(false);
	});

	it('blocks non-owners', () => {
		expect(canChangeCollaboratorRole('other', 'owner', 'collab')).toBe(false);
	});
});

describe('roleAllowsWrite', () => {
	it('allows author and coauthor', () => {
		expect(roleAllowsWrite('author')).toBe(true);
		expect(roleAllowsWrite('coauthor')).toBe(true);
	});

	it('blocks reviewer, commenter and null', () => {
		expect(roleAllowsWrite('reviewer')).toBe(false);
		expect(roleAllowsWrite('commenter')).toBe(false);
		expect(roleAllowsWrite(null)).toBe(false);
	});
});

describe('canWriteDocument', () => {
	const base = { isProjectOwner: false, writerUserId: null, currentUserId: 'u1', collaboratorRole: null };

	it('allows project owner when no delegation', () => {
		expect(canWriteDocument({ ...base, isProjectOwner: true })).toBe(true);
	});

	it('blocks non-owner when no delegation', () => {
		expect(canWriteDocument({ ...base, collaboratorRole: 'author' })).toBe(false);
	});

	it('allows delegated writer with write-capable role', () => {
		expect(canWriteDocument({ ...base, writerUserId: 'u1', collaboratorRole: 'author' })).toBe(true);
		expect(canWriteDocument({ ...base, writerUserId: 'u1', collaboratorRole: 'coauthor' })).toBe(true);
	});

	it('blocks delegated writer whose role was downgraded', () => {
		expect(canWriteDocument({ ...base, writerUserId: 'u1', collaboratorRole: 'reviewer' })).toBe(false);
		expect(canWriteDocument({ ...base, writerUserId: 'u1', collaboratorRole: 'commenter' })).toBe(false);
	});

	it('blocks a non-writer even with author role', () => {
		expect(canWriteDocument({ ...base, writerUserId: 'u2', collaboratorRole: 'author' })).toBe(false);
	});

	it('blocks project owner when writing is delegated to another', () => {
		expect(canWriteDocument({ ...base, isProjectOwner: true, writerUserId: 'u2' })).toBe(false);
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
