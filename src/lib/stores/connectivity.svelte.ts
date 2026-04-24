import { pouchStore, type SyncStatus } from '$lib/offline/pouch.svelte';
import { flash } from '$lib/stores/flash.svelte';

class ConnectivityStore {
	// Mirrors pouchStore.status with a flash message on successful sync from offline
	private _prevStatus: SyncStatus = 'initializing';

	get syncState() {
		return pouchStore.status;
	}

	tick() {
		const current = pouchStore.status;
		if (this._prevStatus === 'syncing' && current === 'synced') {
			flash.set('Synced', 'success');
		}
		this._prevStatus = current;
	}
}

export const connectivity = new ConnectivityStore();
