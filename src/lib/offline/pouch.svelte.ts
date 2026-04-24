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
		// Guard against double-init (HMR re-evaluation, or called twice)
		if (this.db) return;
		try {
			// PouchDB loaded via script tag in app.html (avoids Vite/esbuild UMD issues)
			const PouchDB = (window as unknown as { PouchDB: PouchDB.Static }).PouchDB;
			if (!PouchDB) {
				console.error('[pouch] window.PouchDB not found — script tag may not have loaded');
				return;
			}
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			this.db = new (PouchDB as any)<OfflineDoc>('scholio-docs', { auto_compaction: true });
			this._startSync();
			window.addEventListener('online', () => this._startSync());
		} catch (e) {
			console.error('[pouch] init failed:', e);
		}
	}

	private _startSync() {
		if (!this.db) return;
		this.syncHandler?.cancel();
		// PouchDB only uses its HTTP adapter when the URL has a scheme (http:// or https://).
		// A root-relative path like '/api/couch/documents' is treated as a local DB name.
		const remoteUrl = `${window.location.origin}/api/couch/documents`;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const handler = (this.db as any).sync(remoteUrl, { live: true, retry: true });
		handler
			.on('active', () => { this.status = 'syncing'; })
			.on('paused', (e: unknown) => { this.status = e instanceof Error ? 'error' : 'synced'; })
			.on('error', (e: unknown) => { console.error('[pouch] sync error', e); this.status = 'error'; })
			.on('denied', (e: unknown) => { console.error('[pouch] sync denied', e); this.status = 'error'; });
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

// Initialize immediately when the module is first loaded in the browser.
// This runs before any component's onMount, avoiding the race where the
// page's onMount (putDocument) fires before the layout's onMount (init).
if (browser) {
	pouchStore.init();
}
