import Dexie, { type Table } from 'dexie';

export type PendingEditStatus = 'pending' | 'synced' | 'failed' | 'writer_lost';

export interface PendingEdit {
	id: string;
	documentId: string;
	content: string; // full snapshot on each manual save
	savedAt: Date;
	status: PendingEditStatus;
}

export type PendingCreateStatus = 'pending' | 'synced' | 'failed';

export interface PendingCreate {
	id: string;          // locally-generated UUID — used as server-side ID on sync
	projectId: string;
	title: string;
	type: string;
	isPrivate: boolean;
	createdAt: Date;
	status: PendingCreateStatus;
	failureReason?: string;
}

class OfflineDB extends Dexie {
	pendingEdits!: Table<PendingEdit, string>;
	pendingCreates!: Table<PendingCreate, string>;

	constructor() {
		super('scholio-offline');
		this.version(1).stores({
			pendingEdits: 'id, documentId, status, savedAt'
		});
		this.version(2).stores({
			pendingEdits: 'id, documentId, status, savedAt',
			pendingCreates: 'id, projectId, status, createdAt'
		});
	}
}

export const offlineDb = new OfflineDB();
