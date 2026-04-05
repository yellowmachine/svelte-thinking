import { offlineDb } from '$lib/offline.db';
import { trpc } from '$lib/utils/trpc';
import { flash } from '$lib/stores/flash.svelte';

export type SyncState = 'idle' | 'syncing' | 'error';

export interface SyncError {
	documentId: string;
	message: string;
	at: Date;
}

class ConnectivityStore {
	syncState = $state<SyncState>('idle');
	syncErrors = $state<SyncError[]>([]);

	async syncAll() {
		if (this.syncState === 'syncing') return;

		const pending = await offlineDb.pendingEdits
			.where('status')
			.equals('pending')
			.sortBy('savedAt');

		if (pending.length === 0) {
			flash.set('Connected', 'success');
			return;
		}

		this.syncState = 'syncing';

		// Latest snapshot per document
		const latestByDoc = new Map<string, (typeof pending)[0]>();
		for (const edit of pending) {
			latestByDoc.set(edit.documentId, edit);
		}

		const errors: SyncError[] = [];

		for (const [documentId, edit] of latestByDoc) {
			try {
				await trpc.documents.saveDraft.mutate({ documentId, content: edit.content });
				await offlineDb.pendingEdits
					.where({ documentId, status: 'pending' })
					.modify({ status: 'synced' });
			} catch (e) {
				const isForbidden =
					e instanceof Error &&
					('code' in e ? (e as { code?: string }).code === 'FORBIDDEN' : e.message.includes('FORBIDDEN'));
				const finalStatus = isForbidden ? 'writer_lost' : 'failed';
				errors.push({
					documentId,
					message: isForbidden ? 'Write access lost' : (e instanceof Error ? e.message : 'Unknown error'),
					at: new Date()
				});
				await offlineDb.pendingEdits
					.where({ documentId, status: 'pending' })
					.modify({ status: finalStatus });
			}
		}

		if (errors.length > 0) {
			this.syncErrors = [...this.syncErrors, ...errors];
			this.syncState = 'error';
		} else {
			this.syncState = 'idle';
			flash.set('Synced', 'success');
		}
	}

	clearErrors() {
		this.syncErrors = [];
		this.syncState = 'idle';
	}
}

export const connectivity = new ConnectivityStore();
