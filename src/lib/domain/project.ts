// Pure domain logic for projects.
// No Svelte, no DB, no network — safe to import from both server and client.

import type { CollaboratorRole } from './permissions';

// ---------------------------------------------------------------------------
// Project status
// ---------------------------------------------------------------------------

export const PROJECT_STATUSES = ['draft', 'active', 'review', 'published', 'archived'] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
	draft: 'Draft',
	active: 'Active',
	review: 'In review',
	published: 'Published',
	archived: 'Archived'
};

// ---------------------------------------------------------------------------
// Project roles
// ---------------------------------------------------------------------------

export type ProjectRole = 'owner' | CollaboratorRole;

export const PROJECT_ROLE_LABELS: Record<ProjectRole, string> = {
	owner: 'Owner',
	author: 'Author',
	coauthor: 'Co-author',
	reviewer: 'Reviewer',
	commenter: 'Commenter'
};

/** Roles that can be assigned via invitation (all except owner). */
export const INVITABLE_ROLES: CollaboratorRole[] = ['author', 'coauthor', 'reviewer', 'commenter'];
