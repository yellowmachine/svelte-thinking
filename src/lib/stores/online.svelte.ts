const PROBE_URL = '/api/health';
const PROBE_INTERVAL_MS = 15_000;
const PROBE_TIMEOUT_MS = 4_000;

class OnlineStore {
	online = $state(true);
	private _initialized = false;

	private async _probe() {
		try {
			await fetch(PROBE_URL, {
				method: 'GET',
				cache: 'no-store',
				signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)
			});
			if (!this.online) console.log('[offline] network: probe succeeded — back online');
			this.online = true;
		} catch {
			if (this.online) console.warn('[offline] network: probe failed — going offline');
			this.online = false;
		}
	}

	init() {
		if (typeof window === 'undefined') return;
		if (this._initialized) return;
		this._initialized = true;

		this.online = navigator.onLine;
		console.log(`[offline] network: initialized — ${navigator.onLine ? 'online' : 'offline'}`);

		window.addEventListener('online', () => {
			console.log('[offline] network: browser event → online, probing…');
			this._probe();
		});
		window.addEventListener('offline', () => {
			console.warn('[offline] network: browser event → offline');
			this.online = false;
		});

		setInterval(() => this._probe(), PROBE_INTERVAL_MS);
	}
}

export const onlineStore = new OnlineStore();
