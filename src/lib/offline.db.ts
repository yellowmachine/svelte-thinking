import Dexie, { type Table } from 'dexie';
import { type PendingEditStatus, type PendingCreateStatus } from '$lib/domain/document';

export type { PendingEditStatus, PendingCreateStatus };

export interface PendingEdit {
	id: string;
	documentId: string;
	content: string; // full snapshot on each manual save
	savedAt: Date;
	status: PendingEditStatus;
}

export interface PendingCreate {
	id: string; // locally-generated UUID — used as server-side ID on sync
	projectId: string;
	title: string;
	type: string;
	isPrivate: boolean;
	createdAt: Date;
	status: PendingCreateStatus;
	failureReason?: string;
}

export interface OfflineIndexEntry {
	url: string; // primary key, e.g. /projects/abc or /projects/abc/documents/xyz
	title: string;
	type: 'project' | 'document';
	projectId?: string; // set for documents
	visitedAt: Date;
	content?: string; // last-seen document content (saved when visiting online)
}

class OfflineDB extends Dexie {
	pendingEdits!: Table<PendingEdit, string>;
	pendingCreates!: Table<PendingCreate, string>;
	offlineIndex!: Table<OfflineIndexEntry, string>;

	constructor() {
		super('scholio-offline');
		this.version(1).stores({
			pendingEdits: 'id, documentId, status, savedAt'
		});
		this.version(2).stores({
			pendingEdits: 'id, documentId, status, savedAt',
			pendingCreates: 'id, projectId, status, createdAt'
		});
		this.version(3).stores({
			pendingEdits: 'id, documentId, status, savedAt',
			pendingCreates: 'id, projectId, status, createdAt',
			offlineIndex: 'url, type, projectId, visitedAt'
		});
		this.version(4).stores({
			pendingEdits: 'id, documentId, status, savedAt',
			pendingCreates: 'id, projectId, status, createdAt',
			offlineIndex: 'url, type, projectId, visitedAt'
			// content field added to OfflineIndexEntry — no index needed
		});
	}
}

export const offlineDb = new OfflineDB();
