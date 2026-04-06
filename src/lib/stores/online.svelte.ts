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
			this.online = true;
		} catch {
			this.online = false;
		}
	}

	init() {
		if (typeof window === 'undefined') return;
		if (this._initialized) return;
		this._initialized = true;

		this.online = navigator.onLine;
		window.addEventListener('online', () => this._probe());
		window.addEventListener('offline', () => { this.online = false; });

		setInterval(() => this._probe(), PROBE_INTERVAL_MS);
	}
}

export const onlineStore = new OnlineStore();
