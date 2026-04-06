// Capability rules for document editor actions.
// Pure functions — no Svelte, no network, no Dexie.
// Each function answers: "what can the user do right now, and why?"

// ---------------------------------------------------------------------------
// Save draft
// ---------------------------------------------------------------------------

export type SaveDraftCapability =
	| { kind: 'ready' }
	| { kind: 'saving' }
	| { kind: 'queued'; hint: string } // offline → will persist locally
	| { kind: 'blocked'; reason: string }; // no write permission

export interface SaveDraftContext {
	canWrite: boolean;
	online: boolean;
	saving: boolean;
}

export function getSaveDraftCapability(ctx: SaveDraftContext): SaveDraftCapability {
	if (!ctx.canWrite) {
		return { kind: 'blocked', reason: 'No tienes permiso de escritura en este documento.' };
	}
	if (ctx.saving) {
		return { kind: 'saving' };
	}
	if (!ctx.online) {
		return { kind: 'queued', hint: 'Sin conexión. El borrador se guardará localmente y se sincronizará al reconectar.' };
	}
	return { kind: 'ready' };
}

export function canTriggerSave(cap: SaveDraftCapability): boolean {
	return cap.kind === 'ready' || cap.kind === 'queued';
}

// ---------------------------------------------------------------------------
// Commit (create version)
// ---------------------------------------------------------------------------

export type CommitCapability =
	| { kind: 'ready' }
	| { kind: 'committing' }
	| { kind: 'blocked'; reason: string };

export interface CommitContext {
	canWrite: boolean;
	online: boolean;
	hasContent: boolean;
	committing: boolean;
}

export function getCommitCapability(ctx: CommitContext): CommitCapability {
	if (!ctx.canWrite) {
		return { kind: 'blocked', reason: 'No tienes permiso de escritura en este documento.' };
	}
	if (!ctx.online) {
		return { kind: 'blocked', reason: 'Necesitas conexión para crear una versión.' };
	}
	if (!ctx.hasContent) {
		return { kind: 'blocked', reason: 'El documento está vacío.' };
	}
	if (ctx.committing) {
		return { kind: 'committing' };
	}
	return { kind: 'ready' };
}

export function canTriggerCommit(cap: CommitCapability): boolean {
	return cap.kind === 'ready';
}

// ---------------------------------------------------------------------------
// Reclaim writing (owner takes back from delegated writer)
// ---------------------------------------------------------------------------

export type ReclaimWritingCapability =
	| { kind: 'available' }
	| { kind: 'hidden' }; // not owner, or no writer delegated

export interface ReclaimWritingContext {
	isOwner: boolean;
	writerUserId: string | null;
}

export function getReclaimWritingCapability(ctx: ReclaimWritingContext): ReclaimWritingCapability {
	if (ctx.isOwner && ctx.writerUserId !== null) {
		return { kind: 'available' };
	}
	return { kind: 'hidden' };
}
