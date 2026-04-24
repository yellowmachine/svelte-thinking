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
	private pullHandler: PouchDB.Replication.Replication<OfflineDoc> | null = null;
	// Doc _ids that were saved offline and need to be pushed to CouchDB
	private pendingPush = new Set<string>();

	async init() {
		if (!browser) return;
		if (this.db) return;
		try {
			const PouchDB = (window as unknown as { PouchDB: PouchDB.Static }).PouchDB;
			if (!PouchDB) {
				console.error('[pouch] window.PouchDB not found — script tag may not have loaded');
				return;
			}
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			this.db = new (PouchDB as any)<OfflineDoc>('scholio-docs', { auto_compaction: true });
			this._startPull();
			window.addEventListener('online', () => this._onOnline());
		} catch (e) {
			console.error('[pouch] init failed:', e);
		}
	}

	// Pull-only live replication: keeps local DB in sync with CouchDB without
	// echoing pulled documents back — only explicit pushPending() writes to remote.
	private _startPull() {
		if (!this.db) return;
		this.pullHandler?.cancel();
		const remoteUrl = `${window.location.origin}/api/couch/documents`;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const handler = (this.db as any).replicate.from(remoteUrl, { live: true, retry: true });
		handler
			.on('active', () => { this.status = 'syncing'; })
			.on('paused', (e: unknown) => { this.status = e instanceof Error ? 'error' : 'synced'; })
			.on('error', (e: unknown) => { console.error('[pouch] pull error', e); this.status = 'error'; })
			.on('denied', (e: unknown) => { console.error('[pouch] pull denied', e); this.status = 'error'; });
		this.pullHandler = handler as PouchDB.Replication.Replication<OfflineDoc>;
	}

	private async _onOnline() {
		this._startPull();
		await this._pushPending();
	}

	private async _pushPending() {
		if (!this.db || this.pendingPush.size === 0) return;
		const docIds = Array.from(this.pendingPush);
		const remoteUrl = `${window.location.origin}/api/couch/documents`;
		this.status = 'syncing';
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await (this.db as any).replicate.to(remoteUrl, { doc_ids: docIds });
			this.pendingPush.clear();
			this.status = 'synced';
			console.log(`[pouch] pushed offline docs: ${docIds.join(', ')}`);
		} catch (e) {
			console.error('[pouch] push failed:', e);
			this.status = 'error';
		}
	}

	async getDocument(documentId: string): Promise<OfflineDoc | null> {
		if (!this.db) return null;
		try {
			return await this.db.get(`doc_${documentId}`);
		} catch {
			return null;
		}
	}

	async putDocument(doc: Omit<OfflineDoc, '_id' | '_rev'>, { offline = false } = {}): Promise<void> {
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
		if (offline) {
			this.pendingPush.add(id);
		}
	}

	async listDocuments(): Promise<OfflineDoc[]> {
		if (!this.db) return [];
		const result = await this.db.allDocs<OfflineDoc>({ include_docs: true, startkey: 'doc_', endkey: 'doc_￿' });
		return result.rows.map((r) => r.doc as OfflineDoc).filter(Boolean);
	}

	destroy() {
		this.pullHandler?.cancel();
	}

	async logout() {
		this.pullHandler?.cancel();
		if (this.db) {
			try { await this.db.destroy(); } catch { /* ignore */ }
			this.db = null;
		}
		localStorage.removeItem('scholio-pending-creates');
	}
}

export const pouchStore = new PouchStore();

if (browser) {
	pouchStore.init();
}
