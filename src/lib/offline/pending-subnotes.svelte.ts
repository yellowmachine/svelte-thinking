import { browser } from '$app/environment';

export interface PendingSubnote {
	id: string;
	type: 'create' | 'update';
	/** For type==='update': the real numeric server subnote ID */
	subnoteId?: number;
	referenceId: string;
	projectId: string;
	slug: string;
	notes: string;
	createdAt: string;
	status: 'pending' | 'synced' | 'failed';
	failureReason?: string;
}

const STORAGE_KEY = 'scholio-pending-subnotes';

class PendingSubnotesStore {
	items = $state<PendingSubnote[]>([]);

	init() {
		if (!browser) return;
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			const parsed: PendingSubnote[] = raw ? JSON.parse(raw) : [];
			this.items = parsed.map((i) => ({ ...i, type: i.type ?? 'create' }));
		} catch {
			this.items = [];
		}
	}

	private _persist() {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items));
	}

	add(item: Omit<PendingSubnote, 'createdAt' | 'status' | 'type'>) {
		const entry: PendingSubnote = { ...item, type: 'create', createdAt: new Date().toISOString(), status: 'pending' };
		this.items = [...this.items, entry];
		this._persist();
	}

	/** Queue an offline edit for an existing server subnote. Upserts by subnoteId. */
	addUpdate(subnoteId: number, projectId: string, referenceId: string, notes: string) {
		this.items = this.items.filter((i) => !(i.type === 'update' && i.subnoteId === subnoteId));
		const entry: PendingSubnote = {
			id: `pending_update_${crypto.randomUUID()}`,
			type: 'update',
			subnoteId,
			referenceId,
			projectId,
			slug: '',
			notes,
			createdAt: new Date().toISOString(),
			status: 'pending'
		};
		this.items = [...this.items, entry];
		this._persist();
	}

	update(id: string, updates: Partial<PendingSubnote>) {
		this.items = this.items.map((i) => (i.id === id ? { ...i, ...updates } : i));
		this._persist();
	}

	forProject(projectId: string) {
		return this.items.filter((i) => i.projectId === projectId && i.status === 'pending');
	}

	clearSynced() {
		this.items = this.items.filter((i) => i.status !== 'synced');
		this._persist();
	}
}

export const pendingSubnotes = new PendingSubnotesStore();

if (browser) {
	pendingSubnotes.init();
}
