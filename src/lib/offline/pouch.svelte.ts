import { browser } from '$app/environment';

export interface OfflineDoc {
	_id: string;
	_rev?: string;
	documentId: string;
	projectId: string;
	title: string;
	type: string;
	content: string;
	updatedAt: string;
}

export type SyncStatus = 'initializing' | 'synced' | 'syncing' | 'error' | 'offline';

class PouchStore {
	status = $state<SyncStatus>('initializing');
	private db: PouchDB.Database<OfflineDoc> | null = null;
	private syncHandler: PouchDB.Replication.Sync<OfflineDoc> | null = null;

	async init() {
		if (!browser) return;
		const PouchDB = (await import('pouchdb-browser')).default;
		this.db = new PouchDB<OfflineDoc>('scholio-docs');
		this._startSync();
	}

	private _startSync() {
		if (!this.db) return;
		this.syncHandler?.cancel();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const handler = (this.db as any).sync('/api/couch/documents', { live: true, retry: true });
		handler
			.on('active', () => { this.status = 'syncing'; })
			.on('paused', () => { this.status = 'synced'; })
			.on('error', () => { this.status = 'error'; })
			.on('denied', () => { this.status = 'error'; });
		this.syncHandler = handler as PouchDB.Replication.Sync<OfflineDoc>;
	}

	async getDocument(documentId: string): Promise<OfflineDoc | null> {
		if (!this.db) return null;
		try {
			return await this.db.get(`doc_${documentId}`);
		} catch {
			return null;
		}
	}

	async putDocument(doc: Omit<OfflineDoc, '_id' | '_rev'>): Promise<void> {
		if (!this.db) return;
		const id = `doc_${doc.documentId}`;
		try {
			const existing = await this.db.get(id);
			await this.db.put({ ...doc, _id: id, _rev: existing._rev });
		} catch (e) {
			if ((e as { status?: number }).status === 404) {
				await this.db.put({ ...doc, _id: id });
			} else {
				throw e;
			}
		}
	}

	async listDocuments(): Promise<OfflineDoc[]> {
		if (!this.db) return [];
		const result = await this.db.allDocs<OfflineDoc>({ include_docs: true, startkey: 'doc_', endkey: 'doc_￿' });
		return result.rows.map((r) => r.doc as OfflineDoc).filter(Boolean);
	}

	destroy() {
		this.syncHandler?.cancel();
	}

	async logout() {
		this.syncHandler?.cancel();
		if (this.db) {
			try { await this.db.destroy(); } catch { /* ignore */ }
			this.db = null;
		}
		localStorage.removeItem('scholio-pending-creates');
	}
}

export const pouchStore = new PouchStore();
