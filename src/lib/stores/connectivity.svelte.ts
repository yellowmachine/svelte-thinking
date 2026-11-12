import { SvelteMap } from 'svelte/reactivity';
import { offlineDb } from '$lib/offline.db';
import { trpc } from '$lib/utils/trpc';
import { flash } from '$lib/stores/flash.svelte';

export type SyncState = 'idle' | 'syncing' | 'error';

export interface SyncError {
	documentId: string;
	message: string;
	at: Date;
}

const SYNCED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

class ConnectivityStore {
	syncState = $state<SyncState>('idle');
	syncErrors = $state<SyncError[]>([]);

	async syncAll() {
		if (this.syncState === 'syncing') return;

		// Synced edits are full snapshots: keep a week for the sync log, then drop them.
		const cutoff = new Date(Date.now() - SYNCED_RETENTION_MS);
		await offlineDb.pendingEdits
			.where('status')
			.equals('synced')
			.and((e) => e.savedAt < cutoff)
			.delete();

		const pending = await offlineDb.pendingEdits
			.where('status')
			.equals('pending')
			.sortBy('savedAt');

		if (pending.length === 0) {
			return;
		}

		this.syncState = 'syncing';

		// Latest snapshot per document
		const latestByDoc = new SvelteMap<string, (typeof pending)[0]>();
		for (const edit of pending) {
			latestByDoc.set(edit.documentId, edit);
		}

		const errors: SyncError[] = [];

		for (const [documentId, edit] of latestByDoc) {
			try {
				await trpc.documents.saveDraft.mutate({
					documentId,
					content: edit.content,
					baseDraftHash: edit.baseDraftHash
				});
				await offlineDb.pendingEdits
					.where({ documentId, status: 'pending' })
					.modify({ status: 'synced' });
			} catch (e) {
				// tRPC puts the error code in e.data.code (it was read from e.code, which
				// never existed, so "write access lost" was never detected).
				const code = (e as { data?: { code?: string } } | null)?.data?.code;
				const isForbidden = code === 'FORBIDDEN';
				const isConflict = code === 'CONFLICT';
				const finalStatus = isForbidden ? 'writer_lost' : 'failed';
				const message = isForbidden
					? 'Write access lost'
					: isConflict
						? 'The draft was changed elsewhere while you were offline; your version was not applied'
						: e instanceof Error
							? e.message
							: 'Unknown error';
				console.warn(
					`[offline] syncAll: ✗ failed document ${documentId} — ${message} (status: ${finalStatus})`
				);
				errors.push({ documentId, message, at: new Date() });
				await offlineDb.pendingEdits
					.where({ documentId, status: 'pending' })
					.modify({ status: finalStatus, failureReason: message });
			}
		}

		if (errors.length > 0) {
			console.error(`[offline] syncAll: completed with ${errors.length} error(s)`, errors);
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
