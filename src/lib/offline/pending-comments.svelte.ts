import { browser } from '$app/environment';

export interface PendingComment {
	id: string;
	type: 'create' | 'update';
	/** For type==='update': the real server comment ID being edited */
	commentId?: string;
	documentId: string;
	content: string;
	// inline with text selection (type==='create' only):
	anchorText?: string;
	anchorContext?: string;
	lineStart?: number;
	lineEnd?: number;
	characterStart?: number;
	characterEnd?: number;
	// inline paragraph (type==='create' only):
	paragraphNumber?: number;
	// reply to an existing comment (type==='create' only):
	parentCommentId?: string;
	createdAt: string;
	status: 'pending' | 'synced' | 'failed';
	failureReason?: string;
}

const STORAGE_KEY = 'scholio-pending-comments';

class PendingCommentsStore {
	items = $state<PendingComment[]>([]);

	init() {
		if (!browser) return;
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			const parsed: PendingComment[] = raw ? JSON.parse(raw) : [];
			// Backfill type for items saved before the type field was added
			this.items = parsed.map((i) => ({ ...i, type: i.type ?? 'create' }));
		} catch {
			this.items = [];
		}
	}

	private _persist() {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items));
	}

	add(item: Omit<PendingComment, 'createdAt' | 'status' | 'type'>) {
		const entry: PendingComment = { ...item, type: 'create', createdAt: new Date().toISOString(), status: 'pending' };
		this.items = [...this.items, entry];
		this._persist();
	}

	/** Queue an offline edit for an existing server comment. Upserts by commentId so only the last edit is sent. */
	addUpdate(commentId: string, documentId: string, content: string) {
		this.items = this.items.filter((i) => !(i.type === 'update' && i.commentId === commentId));
		const entry: PendingComment = {
			id: `pending_update_${crypto.randomUUID()}`,
			type: 'update',
			commentId,
			documentId,
			content,
			createdAt: new Date().toISOString(),
			status: 'pending'
		};
		this.items = [...this.items, entry];
		this._persist();
	}

	update(id: string, updates: Partial<PendingComment>) {
		this.items = this.items.map((i) => (i.id === id ? { ...i, ...updates } : i));
		this._persist();
	}

	forDocument(documentId: string) {
		return this.items.filter((i) => i.documentId === documentId && i.status === 'pending');
	}

	clearSynced() {
		this.items = this.items.filter((i) => i.status !== 'synced');
		this._persist();
	}
}

export const pendingComments = new PendingCommentsStore();

if (browser) {
	pendingComments.init();
}
