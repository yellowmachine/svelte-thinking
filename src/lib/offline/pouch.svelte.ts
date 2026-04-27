import { browser } from '$app/environment';

export interface OfflineDocDiffCommentCreate {
	id: string;
	type: 'general' | 'inline';
	content: string;
	anchorText?: string;
	anchorContext?: string;
	lineStart?: number;
	lineEnd?: number;
	characterStart?: number;
	characterEnd?: number;
	paragraphNumber?: number;
	parentCommentId?: string;
	createdAt?: string;
}

export interface OfflineDocDiff {
	comments?: {
		create?: OfflineDocDiffCommentCreate[];
		update?: Array<{ id: string; content: string }>;
		delete?: Array<{ id: string }>;
	};
	subnotes?: {
		upsert?: Array<{ referenceId: string; slug: string; notes: string }>;
		delete?: Array<{ referenceId: string; slug: string }>;
	};
}

export interface OfflineDoc {
	_id: string;
	_rev?: string;
	documentId: string;
	projectId: string;
	title: string;
	type: string;
	content: string;
	updatedAt: string;
	diff?: OfflineDocDiff;
}

export interface OfflineProjectMeta {
	_id: string;
	_rev?: string;
	projectId: string;
	title: string;
	description: string | null;
	documentIds: string[];
	cachedAt: string;
}

export interface OfflineComments {
	_id: string;
	_rev?: string;
	documentId: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	general: any[];
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	inline: any[];
	cachedAt: string;
}

export interface OfflineReferences {
	_id: string;
	_rev?: string;
	projectId: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	references: any[];
	cachedAt: string;
}

export interface OfflineProjectOps {
	_id: string;
	_rev?: string;
	projectId: string;
	subnotes?: {
		upsert?: Array<{ referenceId: string; slug: string; notes: string }>;
		delete?: Array<{ referenceId: string; slug: string }>;
	};
}

export type SyncStatus = 'initializing' | 'synced' | 'syncing' | 'error' | 'offline';

class PouchStore {
	status = $state<SyncStatus>('initializing');
	pushStatus = $state<'idle' | 'syncing' | 'synced' | 'error'>('idle');
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
		this.pushStatus = 'syncing';
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await (this.db as any).replicate.to(remoteUrl, { doc_ids: docIds });
			this.pendingPush.clear();
			this.pushStatus = 'synced';
			console.log(`[pouch] pushed offline docs: ${docIds.join(', ')}`);
		} catch (e) {
			console.error('[pouch] push failed:', e);
			this.pushStatus = 'error';
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

	async mergeDiff(documentId: string, incoming: OfflineDocDiff): Promise<void> {
		const existing = await this.getDocument(documentId);
		if (!existing) return;
		const merged = _mergeDiffs(existing.diff ?? {}, incoming);
		await this.putDocument({ ...existing, diff: merged }, { offline: true });
	}

	async listDocuments(): Promise<OfflineDoc[]> {
		if (!this.db) return [];
		const result = await this.db.allDocs<OfflineDoc>({ include_docs: true, startkey: 'doc_', endkey: 'doc_￿' });
		return result.rows.map((r) => r.doc as OfflineDoc).filter(Boolean);
	}

	// ── Project meta ───────────────────────────────────────────────────────

	async getProjectMeta(projectId: string): Promise<OfflineProjectMeta | null> {
		if (!this.db) return null;
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			return await (this.db as any).get(`project_${projectId}`) as OfflineProjectMeta;
		} catch { return null; }
	}

	async putProjectMeta(meta: Omit<OfflineProjectMeta, '_id' | '_rev'>): Promise<void> {
		if (!this.db) return;
		const id = `project_${meta.projectId}`;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const db = this.db as any;
		try {
			const existing = await db.get(id);
			await db.put({ ...meta, _id: id, _rev: existing._rev });
		} catch (e) {
			if ((e as { status?: number }).status === 404) await db.put({ ...meta, _id: id });
			else throw e;
		}
	}

	// ── Comments ───────────────────────────────────────────────────────────

	async getComments(documentId: string): Promise<OfflineComments | null> {
		if (!this.db) return null;
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			return await (this.db as any).get(`comments_${documentId}`) as OfflineComments;
		} catch { return null; }
	}

	async putComments(data: Omit<OfflineComments, '_id' | '_rev'>): Promise<void> {
		if (!this.db) return;
		const id = `comments_${data.documentId}`;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const db = this.db as any;
		try {
			const existing = await db.get(id);
			await db.put({ ...data, _id: id, _rev: existing._rev });
		} catch (e) {
			if ((e as { status?: number }).status === 404) await db.put({ ...data, _id: id });
			else throw e;
		}
	}

	// ── References ─────────────────────────────────────────────────────────

	async getReferences(projectId: string): Promise<OfflineReferences | null> {
		if (!this.db) return null;
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			return await (this.db as any).get(`refs_${projectId}`) as OfflineReferences;
		} catch { return null; }
	}

	async putReferences(data: Omit<OfflineReferences, '_id' | '_rev'>): Promise<void> {
		if (!this.db) return;
		const id = `refs_${data.projectId}`;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const db = this.db as any;
		try {
			const existing = await db.get(id);
			await db.put({ ...data, _id: id, _rev: existing._rev });
		} catch (e) {
			if ((e as { status?: number }).status === 404) await db.put({ ...data, _id: id });
			else throw e;
		}
	}

	// ── Project ops (pending subnote operations) ───────────────────────────

	async getProjectOps(projectId: string): Promise<OfflineProjectOps | null> {
		if (!this.db) return null;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const db = this.db as any;
		try { return await db.get(`ops_${projectId}`) as OfflineProjectOps; } catch { return null; }
	}

	private async _putProjectOps(data: Omit<OfflineProjectOps, '_id' | '_rev'>): Promise<void> {
		if (!this.db) return;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const db = this.db as any;
		const id = `ops_${data.projectId}`;
		try {
			const existing = await db.get(id);
			await db.put({ ...data, _id: id, _rev: existing._rev });
		} catch (e) {
			if ((e as { status?: number }).status === 404) await db.put({ ...data, _id: id });
			else throw e;
		}
		this.pendingPush.add(id);
	}

	async mergeProjectOps(projectId: string, incoming: OfflineProjectOps['subnotes']): Promise<void> {
		const existing = await this.getProjectOps(projectId);
		const prev = existing?.subnotes ?? {};
		let upserts = [...(prev.upsert ?? [])];
		let deletes = [...(prev.delete ?? [])];

		for (const s of (incoming?.upsert ?? [])) {
			const i = upserts.findIndex((x) => x.referenceId === s.referenceId && x.slug === s.slug);
			if (i >= 0) upserts[i] = s;
			else upserts.push(s);
			deletes = deletes.filter((x) => !(x.referenceId === s.referenceId && x.slug === s.slug));
		}

		for (const s of (incoming?.delete ?? [])) {
			upserts = upserts.filter((x) => !(x.referenceId === s.referenceId && x.slug === s.slug));
			if (!deletes.find((x) => x.referenceId === s.referenceId && x.slug === s.slug)) deletes.push(s);
		}

		await this._putProjectOps({
			projectId,
			subnotes: {
				...(upserts.length && { upsert: upserts }),
				...(deletes.length && { delete: deletes })
			}
		});
	}

	async isPrefetched(projectId: string): Promise<boolean> {
		const meta = await this.getProjectMeta(projectId);
		return !!meta;
	}

	async clearProject(projectId: string): Promise<void> {
		if (!this.db) return;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const db = this.db as any;

		const meta = await this.getProjectMeta(projectId);
		const docIds = meta?.documentIds ?? [];

		const toRemove: string[] = [
			`project_${projectId}`,
			`refs_${projectId}`,
			`ops_${projectId}`,
			...docIds.map((id) => `doc_${id}`),
			...docIds.map((id) => `comments_${id}`)
		];

		await Promise.allSettled(toRemove.map(async (id) => {
			try {
				const doc = await db.get(id);
				await db.remove(doc);
			} catch { /* already gone */ }
		}));
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
		localStorage.removeItem('scholio-pending-comments');
		localStorage.removeItem('scholio-pending-subnotes');
		localStorage.removeItem('scholio-prefetch-meta');
	}
}

export const pouchStore = new PouchStore();

if (browser) {
	pouchStore.init();
}

// ── Diff merge helper ──────────────────────────────────────────────────────────

function _mergeDiffs(prev: OfflineDocDiff, incoming: OfflineDocDiff): OfflineDocDiff {
	const result: OfflineDocDiff = {};

	// ── Comments ────────────────────────────────────────────────────────────
	const ic = incoming.comments;
	if (ic || prev.comments) {
		let creates = [...(prev.comments?.create ?? [])];
		let updates = [...(prev.comments?.update ?? [])];
		let deletes = [...(prev.comments?.delete ?? [])];

		for (const c of (ic?.create ?? [])) {
			if (!creates.find((x) => x.id === c.id)) creates.push(c);
		}

		for (const u of (ic?.update ?? [])) {
			// If the comment hasn't reached the server yet, update it in creates
			const ci = creates.findIndex((x) => x.id === u.id);
			if (ci >= 0) {
				creates[ci] = { ...creates[ci], content: u.content };
			} else {
				const ui = updates.findIndex((x) => x.id === u.id);
				if (ui >= 0) updates[ui] = u;
				else updates.push(u);
			}
		}

		for (const d of (ic?.delete ?? [])) {
			const wasLocalOnly = creates.some((x) => x.id === d.id);
			creates = creates.filter((x) => x.id !== d.id);
			updates = updates.filter((x) => x.id !== d.id);
			if (!wasLocalOnly && !deletes.find((x) => x.id === d.id)) deletes.push(d);
		}

		result.comments = {
			...(creates.length && { create: creates }),
			...(updates.length && { update: updates }),
			...(deletes.length && { delete: deletes })
		};
	}

	// ── Subnotes ────────────────────────────────────────────────────────────
	const is = incoming.subnotes;
	if (is || prev.subnotes) {
		let upserts = [...(prev.subnotes?.upsert ?? [])];
		let snDeletes = [...(prev.subnotes?.delete ?? [])];

		for (const s of (is?.upsert ?? [])) {
			const i = upserts.findIndex((x) => x.referenceId === s.referenceId && x.slug === s.slug);
			if (i >= 0) upserts[i] = s;
			else upserts.push(s);
			snDeletes = snDeletes.filter((x) => !(x.referenceId === s.referenceId && x.slug === s.slug));
		}

		for (const s of (is?.delete ?? [])) {
			upserts = upserts.filter((x) => !(x.referenceId === s.referenceId && x.slug === s.slug));
			if (!snDeletes.find((x) => x.referenceId === s.referenceId && x.slug === s.slug)) snDeletes.push(s);
		}

		result.subnotes = {
			...(upserts.length && { upsert: upserts }),
			...(snDeletes.length && { delete: snDeletes })
		};
	}

	return result;
}
