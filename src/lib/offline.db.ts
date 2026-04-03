import Dexie, { type Table } from 'dexie';

export type PendingEditStatus = 'pending' | 'synced' | 'failed' | 'writer_lost';

export interface PendingEdit {
	id: string;
	documentId: string;
	content: string; // full snapshot on each manual save
	savedAt: Date;
	status: PendingEditStatus;
}

class OfflineDB extends Dexie {
	pendingEdits!: Table<PendingEdit, string>;

	constructor() {
		super('scholio-offline');
		this.version(1).stores({
			pendingEdits: 'id, documentId, status, savedAt'
		});
	}
}

export const offlineDb = new OfflineDB();
