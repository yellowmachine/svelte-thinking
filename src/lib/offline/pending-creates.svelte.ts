import { browser } from '$app/environment';

export interface PendingCreate {
	id: string;
	projectId: string;
	title: string;
	type: string;
	isPrivate: boolean;
	createdAt: string;
	status: 'pending' | 'synced' | 'failed';
	failureReason?: string;
}

const STORAGE_KEY = 'scholio-pending-creates';

class PendingCreatesStore {
	items = $state<PendingCreate[]>([]);

	init() {
		if (!browser) return;
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			this.items = raw ? JSON.parse(raw) : [];
		} catch {
			this.items = [];
		}
	}

	private _persist() {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items));
	}

	add(item: Omit<PendingCreate, 'createdAt' | 'status'>) {
		const entry: PendingCreate = { ...item, createdAt: new Date().toISOString(), status: 'pending' };
		this.items = [...this.items, entry];
		this._persist();
	}

	update(id: string, updates: Partial<PendingCreate>) {
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

export const pendingCreates = new PendingCreatesStore();
